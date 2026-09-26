import "server-only";
import type { Filter } from "mongodb";
import { col, nextSeq, type ConversationDoc, type EscalationDoc } from "./db";
import { newChatToken, tokenMatches } from "./auth";
import { followupAnswer } from "./bot";
import { composeAnswer } from "./answer";
import { getSettings } from "./settings";
import { ApiError, badRequest, forbidden, notFound } from "./http";
import { HANDOFF_OFFHOURS_TEXT, HANDOFF_TEXT, deriveOutcome, topicOfMessages, type Conversation, type LogMessage } from "@/lib/conversations";
import { maskPii } from "@/lib/pii";
import { labelFor, type Followup, type TopicId } from "@/lib/data";
import type { Lang } from "@/lib/i18n";
import { withinWorkingHours } from "@/lib/settings";

const MAX_MESSAGES = 300;
const now = () => new Date().toISOString();

/* ---------------- shapes ---------------- */

/** A message as the citizen's browser sees it. `idx` is its position in the conversation (used to dedupe polling). */
export interface ChatMessageDto extends LogMessage {
  idx: number;
  followups?: Followup[];
}

const toChatMessages = (msgs: LogMessage[], from = 0): ChatMessageDto[] => msgs.slice(from).map((m, i) => ({ ...m, idx: from + i }));

/** Admin-facing conversation (never includes the token hash or search text). */
export function toConversation(d: ConversationDoc): Conversation {
  return {
    id: d._id,
    startedAt: d.startedAt,
    lang: d.lang,
    topic: d.topic,
    messages: d.messages,
    escalated: d.escalated,
    escalationId: d.escalationId,
    rating: d.rating,
    reviewed: d.reviewed,
    flagged: d.flagged,
    note: d.note,
    kbAdded: d.kbAdded,
  };
}

/** Fields derived from the messages, kept on the document so lists can filter/sort/search in the database. */
export function derived(messages: LogMessage[], escalated: boolean) {
  const first = messages.find((m) => m.role === "user")?.text ?? "";
  const last = messages[messages.length - 1];
  return {
    outcome: deriveOutcome({ escalated, messages } as Conversation),
    firstQuestion: first,
    userMessages: messages.filter((m) => m.role === "user").length,
    messageCount: messages.length,
    lastMessageAt: last?.at ?? now(),
    searchText: messages.map((m) => m.text).join(" \n ").toLowerCase(),
    topic: topicOfMessages(messages),
  };
}

/* ---------------- lookup + auth ---------------- */

async function loadOwned(id: string, token: string): Promise<ConversationDoc> {
  const doc = await (await col.conversations()).findOne({ _id: id });
  if (!doc) throw notFound("কথোপকথন পাওয়া যায়নি।");
  if (!token || !tokenMatches(token, doc.tokenHash)) throw forbidden("এই কথোপকথনে প্রবেশের অনুমতি নেই।");
  return doc;
}

/* ---------------- public actions ---------------- */

export async function postUserMessage(input: {
  conversationId?: string;
  token?: string;
  text: string;
  lang: Lang;
  followup?: { topicId: TopicId; label: string };
}): Promise<{ conversationId: string; token?: string; total: number; messages: ChatMessageDto[]; escalationStatus: string | null }> {
  const settings = await getSettings();
  const conversations = await col.conversations();

  let doc: ConversationDoc;
  let issuedToken: string | undefined;
  if (input.conversationId) {
    doc = await loadOwned(input.conversationId, input.token ?? "");
  } else {
    const { token, hash } = newChatToken();
    issuedToken = token;
    const startedAt = now();
    const greeting: LogMessage = { role: "bot", text: settings.bot.greeting, at: startedAt };
    doc = {
      _id: `CV-${await nextSeq("conversation", 1000)}`,
      tokenHash: hash,
      startedAt,
      lang: input.lang,
      escalated: false,
      reviewed: false,
      flagged: false,
      note: "",
      messages: [greeting],
      ...derived([greeting], false),
    };
    await conversations.insertOne(doc);
  }
  if (doc.messages.length >= MAX_MESSAGES) throw badRequest("কথোপকথনটি অনেক দীর্ঘ হয়ে গেছে। নতুন কথোপকথন শুরু করুন।");

  const before = doc.messages.length;
  const added: (LogMessage & { followups?: Followup[] })[] = [{ role: "user", text: maskPii(input.text), at: now() }];

  // A human owns the chat while a case is open; once it is resolved the bot resumes.
  const openCase = doc.escalationId ? await (await col.escalations()).findOne({ _id: doc.escalationId, status: { $ne: "resolved" } }, { projection: { _id: 1 } }) : null;

  if (!openCase) {
    if (settings.bot.maintenance) {
      added.push({ role: "bot", text: settings.bot.maintenanceMessage, at: now(), fallback: true });
    } else if (input.followup) {
      const text = followupAnswer(input.followup.topicId, input.followup.label);
      added.push(text ? { role: "bot", text, at: now() } : { role: "bot", text: settings.bot.fallback, at: now(), fallback: true });
    } else {
      const kb = await (await col.kb()).find({ active: true }).toArray();
      const history = doc.messages.filter((m) => (m.role === "user" || m.role === "bot") && !m.fallback).slice(-4).map((m) => ({ role: m.role === "user" ? ("user" as const) : ("assistant" as const), text: m.text }));
      const a = await composeAnswer({ text: input.text, kb: kb.map((k) => ({ ...k, id: k._id })), history, aiEnabled: settings.bot.ai !== false, limitKey: `conv:${doc._id}` });
      if (a.fallback) {
        added.push({ role: "bot", text: settings.bot.fallback, at: now(), fallback: true });
      } else {
        added.push({ role: "bot", text: a.text, at: now(), topic: a.topic ?? undefined, followups: a.followups, ...(a.ai ? { ai: true } : {}) });
        if (a.usedKbIds.length) await (await col.kb()).updateMany({ _id: { $in: a.usedKbIds } }, { $inc: { uses: 1 } });
      }
    }
  }

  const stored: LogMessage[] = added.map(({ followups: _f, ...m }) => (void _f, m));
  const messages = [...doc.messages, ...stored];
  await conversations.updateOne(
    { _id: doc._id },
    { $set: { ...derived(messages, doc.escalated), lang: doc.lang }, $push: { messages: { $each: stored } } },
  );

  const dto = toChatMessages(messages, before).map((m, i) => (added[i]?.followups?.length ? { ...m, followups: added[i].followups } : m));
  return { conversationId: doc._id, token: issuedToken, total: messages.length, messages: dto, escalationStatus: openCase ? "open" : null };
}

/** Poll for anything after message `after` (agent replies, admin notices) plus the case status. */
export async function pollConversation(id: string, token: string, after: number) {
  const doc = await loadOwned(id, token);
  const esc = doc.escalationId ? await (await col.escalations()).findOne({ _id: doc.escalationId }, { projection: { status: 1, assignee: 1 } }) : null;
  return {
    total: doc.messages.length,
    messages: toChatMessages(doc.messages, Math.max(0, after)),
    escalation: esc ? { id: doc.escalationId!, status: esc.status, assignee: esc.assignee } : null,
    rating: doc.rating ?? null,
  };
}

export async function escalateConversation(id: string, token: string, retried = false): Promise<{ inHours: boolean; escalationId?: string | null; total: number; messages: ChatMessageDto[] }> {
  const doc = await loadOwned(id, token);
  const settings = await getSettings();
  if (!settings.handoff.enabled) throw new ApiError(403, "মানব প্রতিনিধির হস্তান্তর এখন বন্ধ আছে।");
  const inHours = withinWorkingHours(settings.hours);
  if (doc.escalationId) return { inHours, escalationId: doc.escalationId, total: doc.messages.length, messages: [] };

  const conversations = await col.conversations();
  // Claim the conversation atomically by flipping `escalated` false→true: exactly one concurrent request wins,
  // so several simultaneous clicks/requests can never create several cases.
  const claim = await conversations.findOneAndUpdate({ _id: id, escalated: { $ne: true } }, { $set: { escalated: true } }, { returnDocument: "after" });
  if (!claim) {
    // Someone else holds the claim and is creating the case: wait briefly for its id.
    for (let i = 0; i < 20; i++) {
      const cur = await conversations.findOne({ _id: id }, { projection: { escalationId: 1, messages: 1 } });
      if (cur?.escalationId) return { inHours, escalationId: cur.escalationId, total: cur.messages.length, messages: [] };
      await new Promise((r) => setTimeout(r, 150));
    }
    // The claimant never finished (e.g. its function crashed). If no case exists, release the claim and retry once.
    const existing = await (await col.escalations()).findOne({ conversationId: id }, { projection: { _id: 1 } });
    if (existing) return { inHours, escalationId: existing._id, total: doc.messages.length, messages: [] };
    if (!retried) {
      await conversations.updateOne({ _id: id, escalationId: null } as unknown as Filter<ConversationDoc>, { $set: { escalated: false } });
      return escalateConversation(id, token, true);
    }
    throw new ApiError(409, "হস্তান্তর প্রক্রিয়াধীন আছে। একটু পরে আবার চেষ্টা করুন।");
  }

  const topic = topicOfMessages(claim.messages);
  const lastQuestion = [...claim.messages].reverse().find((m) => m.role === "user")?.text ?? "সরাসরি মানব প্রতিনিধির সাথে কথা বলার অনুরোধ";
  const year = new Date().getFullYear();
  const escId = `VB-${year}-${String(await nextSeq(`escalation-${year}`, year === 2026 ? 216 : 0)).padStart(4, "0")}`;
  const at = now();
  const esc: EscalationDoc = {
    _id: escId,
    conversationId: id,
    question: lastQuestion,
    citizen: "বেনামী নাগরিক",
    dept: topic ? labelFor(topic) : "সাধারণ",
    status: "new",
    createdAt: at,
    acceptedAt: null,
    resolvedAt: null,
    priority: "normal",
    assignee: null,
    resolution: "",
    activity: [{ at, kind: "event", text: "চ্যাট থেকে মানব প্রতিনিধির জন্য হস্তান্তরের অনুরোধ এসেছে" }],
  };
  await (await col.escalations()).insertOne(esc);

  const notice: LogMessage = { role: "system", text: inHours ? HANDOFF_TEXT : HANDOFF_OFFHOURS_TEXT, at: now() };
  const messages = [...claim.messages, notice];
  await conversations.updateOne({ _id: id }, { $set: { ...derived(messages, true), escalationId: escId }, $push: { messages: notice } });
  return { inHours, escalationId: escId, total: messages.length, messages: toChatMessages(messages, claim.messages.length) };
}

export async function rateConversation(id: string, token: string, rating: number) {
  await loadOwned(id, token);
  await (await col.conversations()).updateOne({ _id: id }, { $set: { rating } });
}
