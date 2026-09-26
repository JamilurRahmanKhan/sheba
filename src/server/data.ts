import "server-only";
import { randomBytes } from "node:crypto";
import { col, type ConversationDoc, type EscalationDoc, type KbDoc } from "./db";
import { derived, toConversation } from "./chat";
import { hashPassword, hashToken } from "./auth";
import { saveSettings } from "./settings";
import { toEscalation } from "./escalations";
import { SEED_ESCALATIONS, SEED_KB, type Escalation, type KbItem, type SeedEscalation } from "@/lib/data";
import { buildSeedConversations, type Conversation } from "@/lib/conversations";
import { normalizeEscalation } from "@/lib/escalations";
import { DEFAULT_SETTINGS, DEMO_OFFICERS, mergeSettings, type Settings } from "@/lib/settings";

const randomHash = () => hashToken(randomBytes(16).toString("hex"));

/* ---------------- conversion between API shapes and stored documents ---------------- */

export function conversationToDoc(c: Conversation): ConversationDoc {
  return {
    _id: c.id,
    tokenHash: randomHash(), // imported/seeded chats cannot be resumed by a citizen
    startedAt: c.startedAt,
    lang: c.lang,
    escalated: c.escalated,
    escalationId: c.escalationId,
    rating: c.rating,
    reviewed: c.reviewed,
    flagged: c.flagged,
    note: c.note,
    kbAdded: c.kbAdded,
    messages: c.messages,
    ...derived(c.messages, c.escalated),
  };
}

function escalationToDoc(e: Escalation, convs: Conversation[]): EscalationDoc {
  const { id, time, ...rest } = e;
  void time;
  return { _id: id, ...rest, conversationId: convs.find((c) => c.escalationId === id)?.id };
}

const kbToDoc = (k: KbItem): KbDoc => {
  const { id, ...rest } = k;
  return { _id: id, ...rest };
};

const maxSuffix = (ids: string[], floor = 0) => ids.reduce((m, id) => Math.max(m, Number(id.split("-").pop()) || 0), floor);

/** Replace all business data (users are never touched). */
async function replaceAll(input: { conversations: Conversation[]; escalations: Escalation[]; kb: KbItem[]; settings: Settings }) {
  const [conversations, escalations, kb, counters] = await Promise.all([col.conversations(), col.escalations(), col.kb(), col.counters()]);
  await Promise.all([conversations.deleteMany({}), escalations.deleteMany({}), kb.deleteMany({}), counters.deleteMany({})]);
  if (input.conversations.length) await conversations.insertMany(input.conversations.map(conversationToDoc));
  if (input.escalations.length) await escalations.insertMany(input.escalations.map((e) => escalationToDoc(e, input.conversations)));
  if (input.kb.length) await kb.insertMany(input.kb.map(kbToDoc));
  await saveSettings(input.settings);

  const year = new Date().getFullYear();
  const escMax = maxSuffix(input.escalations.filter((e) => e.id.startsWith(`VB-${year}-`)).map((e) => e.id));
  await counters.insertMany([
    { _id: "conversation", seq: maxSuffix(input.conversations.map((c) => c.id), 1000) },
    { _id: `escalation-${year}`, seq: escMax },
    ...(year !== 2026 ? [{ _id: "escalation-2026", seq: maxSuffix(input.escalations.filter((e) => e.id.startsWith("VB-2026-")).map((e) => e.id)) }] : []),
  ]);
}

/* ---------------- demo data ---------------- */

/** Wiping everything back to demo data is only allowed outside production, unless ALLOW_DEMO_RESET=true is set on purpose. */
export const resetAllowed = () => process.env.NODE_ENV !== "production" || process.env.ALLOW_DEMO_RESET === "true";

export async function resetToDemo(): Promise<void> {
  const now = Date.now();
  const conversations = buildSeedConversations(now);
  const escalations = (SEED_ESCALATIONS as SeedEscalation[]).map((e) => normalizeEscalation(e, conversations, now, DEMO_OFFICERS[0].name));
  await replaceAll({ conversations, escalations, kb: SEED_KB, settings: DEFAULT_SETTINGS });
}

/** Demo officers (used by the seed script only). Returns the password that was set. */
export async function seedDemoOfficers(password: string): Promise<number> {
  const users = await col.users();
  let created = 0;
  for (const o of DEMO_OFFICERS) {
    const res = await users.updateOne(
      { email: o.email },
      {
        $setOnInsert: {
          _id: `u-${randomBytes(6).toString("hex")}`,
          email: o.email,
          name: o.name,
          role: "officer" as const,
          title: o.title,
          active: true,
          passwordHash: await hashPassword(password),
          createdAt: new Date().toISOString(),
          failedLogins: 0,
        },
      },
      { upsert: true },
    );
    if (res.upsertedCount) created += 1;
  }
  return created;
}

/* ---------------- backup ---------------- */

export async function exportAll() {
  const [conversations, escalations, kb] = await Promise.all([
    (await col.conversations()).find({}).sort({ startedAt: 1 }).toArray(),
    (await col.escalations()).find({}).sort({ createdAt: 1 }).toArray(),
    (await col.kb()).find({}).toArray(),
  ]);
  const { getSettings } = await import("./settings");
  return {
    app: "seba-sohayok",
    version: 2,
    exportedAt: new Date().toISOString(),
    data: {
      conversations: conversations.map(toConversation),
      escalations: escalations.map(toEscalation),
      kb: kb.map(({ _id, ...k }) => ({ id: _id, ...k })),
      settings: await getSettings(),
    },
  };
}

export async function importAll(raw: unknown): Promise<string | null> {
  const env = raw as { app?: string; version?: number; data?: Record<string, unknown> };
  if (env?.app !== "seba-sohayok" || !env.data) return "এটি সেবা সহায়ক AI-এর ব্যাকআপ ফাইল নয়।";
  if (env.version !== 2) return "এই ব্যাকআপ ফাইলটি পুরনো সংস্করণের (শুধু নতুন সংস্করণের ফাইল গ্রহণযোগ্য)।";
  const d = env.data as { conversations?: unknown; escalations?: unknown; kb?: unknown; settings?: unknown };
  if (!Array.isArray(d.conversations) || !Array.isArray(d.escalations) || !Array.isArray(d.kb)) return "ব্যাকআপ ফাইলটি অসম্পূর্ণ বা ক্ষতিগ্রস্ত।";
  const conversations = d.conversations as Conversation[];
  const escalations = d.escalations as Escalation[];
  const kb = d.kb as KbItem[];
  const okConv = conversations.every((c) => c && typeof c.id === "string" && Array.isArray(c.messages) && typeof c.startedAt === "string");
  const okEsc = escalations.every((e) => e && typeof e.id === "string" && typeof e.question === "string" && typeof e.createdAt === "string");
  const okKb = kb.every((k) => k && typeof k.id === "string" && typeof k.question === "string" && typeof k.answer === "string");
  if (!okConv || !okEsc || !okKb) return "ব্যাকআপ ফাইলের তথ্য সঠিক ফরম্যাটে নেই।";
  await replaceAll({ conversations, escalations, kb, settings: mergeSettings(d.settings) });
  return null;
}

/* ---------------- retention ---------------- */

/** Deletes conversations older than `days`, except ones attached to a case that is still open. Returns how many. */
export async function purgeOldConversations(days: number): Promise<number> {
  if (days <= 0) return 0;
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const conversations = await col.conversations();
  const old = await conversations.find({ startedAt: { $lt: cutoff } }, { projection: { escalationId: 1 } }).toArray();
  const escIds = old.map((c) => c.escalationId).filter((x): x is string => !!x);
  const open = new Set((await (await col.escalations()).find({ _id: { $in: escIds }, status: { $ne: "resolved" } }, { projection: { _id: 1 } }).toArray()).map((e) => e._id));
  const del = old.filter((c) => !c.escalationId || !open.has(c.escalationId)).map((c) => c._id);
  if (del.length === 0) return 0;
  return (await conversations.deleteMany({ _id: { $in: del } })).deletedCount;
}

/** How many a purge would remove right now (for the settings preview). */
export async function countPurgeable(days: number): Promise<number> {
  if (days <= 0) return 0;
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const conversations = await col.conversations();
  const old = await conversations.find({ startedAt: { $lt: cutoff } }, { projection: { escalationId: 1 } }).toArray();
  const escIds = old.map((c) => c.escalationId).filter((x): x is string => !!x);
  const open = new Set((await (await col.escalations()).find({ _id: { $in: escIds }, status: { $ne: "resolved" } }, { projection: { _id: 1 } }).toArray()).map((e) => e._id));
  return old.filter((c) => !c.escalationId || !open.has(c.escalationId)).length;
}
