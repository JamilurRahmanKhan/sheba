import { FALLBACK, GREETING, labelFor, matchTopic, type Escalation, type TopicId } from "./data";
import type { Lang } from "./i18n";

export type Outcome = "resolved" | "escalated" | "unanswered";

export interface LogMessage {
  role: "user" | "bot" | "system" | "agent";
  text: string;
  /** ISO timestamp */
  at: string;
  /** name of the human representative (role "agent") */
  agent?: string;
  /** the answer was written by the AI model from the knowledge base */
  ai?: boolean;
  /** system notice added from the admin side (agent joined, case resolved) */
  admin?: boolean;
  /** bot could not match the question to any topic */
  fallback?: boolean;
  topic?: TopicId;
}

export interface Conversation {
  id: string;
  startedAt: string;
  lang: Lang;
  topic: TopicId | null;
  messages: LogMessage[];
  escalated: boolean;
  escalationId?: string;
  /** 1–5, citizen rating (not collected by the chat UI yet) */
  rating?: number;
  reviewed: boolean;
  flagged: boolean;
  note: string;
  /** an admin turned this into a knowledge-base entry */
  kbAdded?: boolean;
}

/** List row: everything the conversation table needs, without the transcript. */
export interface ConversationSummary {
  id: string;
  startedAt: string;
  lang: Lang;
  topic: TopicId | null;
  firstQuestion: string;
  messageCount: number;
  userMessages: number;
  outcome: Outcome;
  rating?: number;
  reviewed: boolean;
  flagged: boolean;
  note: string;
  escalated: boolean;
  escalationId?: string;
  kbAdded?: boolean;
}

export const HANDOFF_TEXT = "একজন মানব প্রতিনিধির কাছে হস্তান্তর করা হয়েছে। অনুগ্রহ করে অপেক্ষা করুন।";
export const HANDOFF_OFFHOURS_TEXT = "আপনার অনুরোধ নথিভুক্ত করা হয়েছে। পরবর্তী কার্যদিবসে একজন মানব প্রতিনিধি এই কথোপকথনে যুক্ত হবেন।";

/* ---------------- derived values ---------------- */

export function deriveOutcome(c: Conversation): Outcome {
  if (c.escalated) return "escalated";
  if (c.messages.some((m) => m.fallback)) return "unanswered";
  return "resolved";
}

export const OUTCOME_META: Record<Outcome, { label: string; bg: string; color: string }> = {
  resolved: { label: "বট উত্তর দিয়েছে", bg: "var(--success-soft)", color: "var(--success)" },
  escalated: { label: "হস্তান্তর", bg: "var(--warn-soft)", color: "var(--warn)" },
  unanswered: { label: "উত্তর পাওয়া যায়নি", bg: "var(--danger-soft)", color: "var(--danger)" },
};

export function firstQuestion(c: Conversation): string {
  return c.messages.find((m) => m.role === "user")?.text ?? "—";
}

export function userMessageCount(c: Conversation): number {
  return c.messages.filter((m) => m.role === "user").length;
}

export function topicOfMessages(messages: LogMessage[]): TopicId | null {
  return messages.find((m) => m.role === "bot" && m.topic)?.topic ?? null;
}

export function topicLabel(c: Conversation): string {
  return c.topic ? labelFor(c.topic) : "অনির্ধারিত";
}

export function durationSeconds(c: Conversation): number {
  const last = c.messages[c.messages.length - 1];
  return last ? Math.max(0, Math.round((new Date(last.at).getTime() - new Date(c.startedAt).getTime()) / 1000)) : 0;
}

/* ---------------- formatting (Asia/Dhaka, Bengali digits) ---------------- */

const TZ = "Asia/Dhaka";

export const bn = (n: number, digits = 0): string =>
  n.toLocaleString("bn-BD", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("bn-BD", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("bn-BD", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
}

export function fmtClock(date: Date): string {
  return date.toLocaleTimeString("bn-BD", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

export function fmtDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m === 0) return `${bn(s)} সেকেন্ড`;
  return s ? `${bn(m)} মিনিট ${bn(s)} সেকেন্ড` : `${bn(m)} মিনিট`;
}

const dhakaDay = (d: Date | string | number) => new Date(d).toLocaleDateString("en-CA", { timeZone: TZ });

export type Period = "all" | "today" | "7d" | "30d";

export function inPeriod(iso: string, period: Period, now = Date.now()): boolean {
  if (period === "all") return true;
  if (period === "today") return dhakaDay(iso) === dhakaDay(now);
  const days = period === "7d" ? 7 : 30;
  return now - new Date(iso).getTime() <= days * 86_400_000;
}

/* ---------------- CSV export ---------------- */

const OUTCOME_CSV: Record<Outcome, string> = { resolved: "AI সমাধান", escalated: "হস্তান্তর", unanswered: "উত্তর পাওয়া যায়নি" };

export function toCsv(rows: Conversation[]): string {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const header = ["আইডি", "শুরুর সময় (ISO)", "ভাষা", "বিষয়", "ফলাফল", "নাগরিকের বার্তা", "রেটিং", "রিভিউ", "ফ্ল্যাগ", "প্রথম প্রশ্ন", "নোট", "ট্রান্সক্রিপ্ট"];
  const lines = rows.map((c) =>
    [
      c.id,
      c.startedAt,
      c.lang,
      topicLabel(c),
      OUTCOME_CSV[deriveOutcome(c)],
      userMessageCount(c),
      c.rating ?? "",
      c.reviewed ? "হ্যাঁ" : "না",
      c.flagged ? "হ্যাঁ" : "না",
      firstQuestion(c),
      c.note,
      c.messages.map((m) => `[${m.role}] ${m.text}`).join("\n"),
    ]
      .map(esc)
      .join(","),
  );
  // BOM so Excel opens Bengali text correctly
  return "﻿" + [header.map(esc).join(","), ...lines].join("\r\n");
}

/* ---------------- seed conversations ---------------- */

type Step = string | { f: string }; // string = typed question, {f} = clicked follow-up chip

interface Spec {
  steps: Step[];
  /** minutes before "now" that the conversation started */
  ago: number;
  lang?: Lang;
  rating?: number;
  esc?: string;
  reviewed?: boolean;
  flagged?: boolean;
  note?: string;
}

const D = 1440;

const SPECS: Spec[] = [
  { steps: ["আমার জন্ম নিবন্ধন সনদে নামের বানান ভুল আছে, কীভাবে সংশোধন করব?", { f: "ফি কত?" }, { f: "কী কাগজ লাগবে?" }], ago: 35, rating: 5 },
  { steps: ["ই-পাসপোর্টের জন্য আবেদন করতে কী কী লাগবে?", { f: "জরুরি সেবা" }], ago: 80, rating: 5 },
  { steps: ["আমার এনআইডি কার্ড হারিয়ে গেছে, নতুন করে কীভাবে পাব?", { f: "ফি কত?" }], ago: 130, rating: 4 },
  { steps: ["বিদ্যুৎ বিল অনলাইনে কীভাবে পরিশোধ করব?"], ago: 190, rating: 2 },
  { steps: ["ভূমি খতিয়ানের নামজারি বাতিল হলে করণীয় কী?"], ago: 225, esc: "VB-2026-0211" },
  { steps: ["বিদেশে থাকা অবস্থায় NID সংশোধন করা যাবে কি?"], ago: 260, esc: "VB-2026-0212" },
  { steps: ["বয়স্ক ভাতার আবেদন বাতিল হয়েছে, কারণ জানতে চাই"], ago: 300, esc: "VB-2026-0213" },
  { steps: ["পাসপোর্ট ডেলিভারি ৩ সপ্তাহ ধরে বিলম্বিত"], ago: 340, esc: "VB-2026-0214" },
  { steps: ["আমার ট্রেড লাইসেন্স নবায়ন করতে চাই, প্রক্রিয়া কী?", { f: "মেয়াদ কতদিন?" }], ago: 420, rating: 5 },
  { steps: ["অনলাইনে আয়কর রিটার্ন কীভাবে দাখিল করব?", { f: "শেষ তারিখ কবে?" }, { f: "ই-টিন কীভাবে পাব?" }], ago: 520, rating: 4 },
  { steps: ["আমার জমির খতিয়ান অনলাইনে কীভাবে যাচাই করব?", { f: "নামজারি কীভাবে করব?" }], ago: D + 60, rating: 5 },
  { steps: ["ড্রাইভিং লাইসেন্স নবায়ন করতে কী লাগবে?"], ago: D + 160, rating: 1, flagged: true },
  { steps: ["বয়স্ক ভাতার জন্য কীভাবে আবেদন করব?", { f: "বয়সসীমা কত?" }, { f: "মাসিক পরিমাণ কত?" }], ago: D + 260, rating: 5, reviewed: true },
  { steps: ["ট্রেড লাইসেন্সের ভুল ঠিকানা সংশোধনের উপায়"], ago: D + 360, esc: "VB-2026-0215", reviewed: true },
  { steps: ["জমির খাজনা অনলাইনে জমা দেওয়ার পর রসিদ পাইনি"], ago: D + 460, esc: "VB-2026-0216", reviewed: true },
  { steps: ["আমি একটি সরকারি সেবা নিয়ে অভিযোগ জানাতে চাই", { f: "ট্র্যাকিং কীভাবে করব?" }], ago: D + 560, rating: 4 },
  { steps: ["জন্ম নিবন্ধনের অনলাইন কপি কীভাবে ডাউনলোড করব?"], ago: 2 * D + 120, rating: 5 },
  { steps: ["টিকা কার্ড হারিয়ে গেলে কী করব?"], ago: 2 * D + 500, rating: 3 },
  { steps: ["nid address change", { f: "ঠিকানা পরিবর্তন" }], ago: 3 * D, lang: "en", rating: 4 },
  { steps: ["passport fee"], ago: 3 * D + 400, lang: "en", rating: 2, flagged: true, note: "ইংরেজি কিওয়ার্ড (passport) বট চিনছে না — কিওয়ার্ড তালিকায় যোগ করা দরকার।" },
  { steps: ["পাসপোর্ট নবায়ন সংক্রান্ত", { f: "কতদিন লাগে?" }], ago: 2 * D + 900, rating: 5 },
  { steps: ["ট্রেড লাইসেন্স ফি", { f: "ফি কত?" }], ago: 8 * D, rating: 5 },
  { steps: ["মুক্তিযোদ্ধা ভাতা সনদ কীভাবে পাব?"], ago: 9 * D, rating: 3, flagged: true, note: "সাধারণ ভাতার উত্তর দিয়েছে; মুক্তিযোদ্ধা ভাতার আলাদা এন্ট্রি দরকার।" },
  { steps: ["ট্যাক্স রিটার্ন জমা দেওয়ার পর রসিদ কোথায় পাব?"], ago: 11 * D, rating: 4 },
  { steps: ["ই-পাসপোর্টের স্ট্যাটাস কীভাবে চেক করব?"], ago: 12 * D, rating: 5 },
  { steps: ["বিয়ের কাবিননামা নিবন্ধন কীভাবে করব?"], ago: 14 * D, rating: 2, reviewed: true, note: "বিবাহ নিবন্ধন বিষয়ে নতুন KB এন্ট্রি প্রয়োজন।" },
  { steps: ["হারানো NID কার্ড পুনরায় তোলার প্রক্রিয়া কী?", { f: "ফি কত?" }], ago: 17 * D, rating: 5 },
  { steps: ["জন্ম সনদ সংশোধন করতে কত দিন লাগবে?", { f: "কতদিন সময় লাগে?" }], ago: 21 * D, rating: 4 },
  { steps: ["গ্যাস সংযোগের আবেদন কীভাবে করব?"], ago: 24 * D },
  { steps: ["খতিয়ান ও দাগ নম্বর দিয়ে জমি খুঁজতে চাই", { f: "খাজনা কীভাবে দেব?" }], ago: 27 * D, rating: 5 },
];

function build(spec: Spec, id: string, now: number): Conversation {
  const started = now - spec.ago * 60_000;
  let cur = started;
  const at = (offsetSec: number) => new Date((cur += offsetSec * 1000)).toISOString();
  const startedAt = new Date(started).toISOString();

  const messages: LogMessage[] = [{ role: "bot", text: GREETING, at: startedAt }];
  let topic: TopicId | null = null;
  let followups: { label: string; answer: string }[] = [];

  cur += 6_000;
  for (const step of spec.steps) {
    if (typeof step === "string") {
      messages.push({ role: "user", text: step, at: new Date(cur).toISOString() });
      const t = matchTopic(step);
      if (t) {
        topic ??= t.id;
        followups = t.followups;
        messages.push({ role: "bot", text: t.answer, at: at(2), topic: t.id });
      } else {
        messages.push({ role: "bot", text: FALLBACK, at: at(2), fallback: true });
      }
    } else {
      messages.push({ role: "user", text: step.f, at: new Date(cur).toISOString() });
      const f = followups.find((x) => x.label === step.f);
      messages.push({ role: "bot", text: f?.answer ?? FALLBACK, at: at(2), fallback: f ? undefined : true });
    }
    cur += 28_000;
  }
  if (spec.esc) messages.push({ role: "system", text: HANDOFF_TEXT, at: at(8) });

  return {
    id,
    startedAt,
    lang: spec.lang ?? "bn",
    topic,
    messages,
    escalated: !!spec.esc,
    escalationId: spec.esc,
    rating: spec.rating,
    reviewed: spec.reviewed ?? false,
    flagged: spec.flagged ?? false,
    note: spec.note ?? "",
  };
}

/** Deterministic sample history, anchored to `now` so it always looks recent. Ids ascend with time. */
export function buildSeedConversations(now: number): Conversation[] {
  const ordered = [...SPECS].sort((a, b) => b.ago - a.ago);
  return ordered.map((spec, i) => build(spec, `CV-${1001 + i}`, now));
}

/* ---------------- retention ---------------- */

/** Conversations that survive a retention sweep. Chats attached to an open case are never removed. */
export function retainConversations(conv: Conversation[], esc: Escalation[], days: number, now: number): Conversation[] {
  if (days <= 0) return conv;
  const cutoff = now - days * 86_400_000;
  return conv.filter((c) => {
    if (new Date(c.startedAt).getTime() >= cutoff) return true;
    const e = c.escalationId ? esc.find((x) => x.id === c.escalationId) : undefined;
    return !!e && e.status !== "resolved";
  });
}
