import type { Conversation } from "./conversations";
import { bn, fmtClock } from "./conversations";
import type { EscActivity, Escalation, Priority, SeedEscalation } from "./data";
import { DEMO_OFFICERS } from "./settings";

const AGENTS = DEMO_OFFICERS.map((m) => m.name);

export const PRIORITY_META: Record<Priority, { label: string; bg: string; color: string }> = {
  normal: { label: "সাধারণ", bg: "var(--surface-2)", color: "var(--text-2)" },
  urgent: { label: "জরুরি", bg: "var(--danger-soft)", color: "var(--danger)" },
};

const MIN = 60_000;

/* ---------------- seed case details (relative to the case's creation time) ---------------- */

interface SeedDetail {
  priority?: Priority;
  assignee?: string;
  acceptAfterMin?: number;
  resolveAfterMin?: number;
  resolution?: string;
}

const SEED_DETAILS: Record<string, SeedDetail> = {
  "VB-2026-0212": { assignee: AGENTS[0], acceptAfterMin: 6 },
  "VB-2026-0214": { priority: "urgent", assignee: AGENTS[1], acceptAfterMin: 4 },
  "VB-2026-0215": {
    assignee: AGENTS[2],
    acceptAfterMin: 5,
    resolveAfterMin: 22,
    resolution: "সিটি কর্পোরেশনের পোর্টালে “তথ্য সংশোধন” আবেদনের ধাপ ও প্রয়োজনীয় কাগজের তালিকা নাগরিককে জানানো হয়েছে।",
  },
  "VB-2026-0216": {
    assignee: AGENTS[0],
    acceptAfterMin: 3,
    resolveAfterMin: 15,
    resolution: "ভূমি অফিসের রেকর্ডে পেমেন্ট নিশ্চিত হয়েছে; রসিদ নাগরিকের মোবাইলে পুনরায় পাঠানো হয়েছে।",
  },
};

const iso = (ms: number) => new Date(ms).toISOString();

type Partial_ = Partial<Escalation> & SeedEscalation;

/**
 * Upgrades a prototype-shaped or older saved escalation to the full shape.
 * Anchors missing timestamps to the linked conversation (or `now`) so history looks coherent.
 */
export function normalizeEscalation(e: Partial_, conversations: Conversation[], now: number, fallbackAgent: string = AGENTS[0]): Escalation {
  const linked = conversations.find((c) => c.escalationId === e.id);
  const lastMsg = linked?.messages[linked.messages.length - 1];
  const createdFallback = !e.createdAt;
  const createdAt = e.createdAt ?? lastMsg?.at ?? iso(now);
  const created = new Date(createdAt).getTime();
  const seed = SEED_DETAILS[e.id] ?? {};

  const status = e.status;
  let acceptedAt = e.acceptedAt ?? null;
  let resolvedAt = e.resolvedAt ?? null;
  let assignee = e.assignee ?? null;
  if (status !== "new") {
    acceptedAt ??= iso(Math.min(created + (seed.acceptAfterMin ?? 5) * MIN, Math.max(now, created)));
    assignee ??= seed.assignee ?? fallbackAgent;
  }
  if (status === "resolved") {
    resolvedAt ??= iso(Math.min(created + (seed.resolveAfterMin ?? 20) * MIN, Math.max(now, created)));
  }

  let activity: EscActivity[] = e.activity ?? [];
  if (!e.activity) {
    activity = [{ at: createdAt, kind: "event", text: "চ্যাট থেকে মানব প্রতিনিধির জন্য হস্তান্তরের অনুরোধ এসেছে" }];
    if (acceptedAt) activity.push({ at: acceptedAt, kind: "event", text: `${assignee} হস্তান্তরটি গ্রহণ করেছেন`, by: assignee ?? undefined });
    if (resolvedAt) activity.push({ at: resolvedAt, kind: "event", text: "সমাধান হিসেবে চিহ্নিত করা হয়েছে", by: assignee ?? undefined });
  }

  return {
    id: e.id,
    question: e.question,
    citizen: e.citizen,
    dept: e.dept,
    status: e.status,
    time: createdFallback && lastMsg ? fmtClock(new Date(createdAt)) : e.time,
    createdAt,
    acceptedAt,
    resolvedAt,
    priority: e.priority ?? seed.priority ?? "normal",
    assignee,
    resolution: e.resolution ?? (status === "resolved" ? (seed.resolution ?? "") : ""),
    activity,
    kbAdded: e.kbAdded,
  };
}

/* ---------------- timing ---------------- */

export const minutesBetween = (fromIso: string, to: number | string): number =>
  Math.max(0, Math.round((new Date(to).getTime() - new Date(fromIso).getTime()) / MIN));

export function fmtMinutes(total: number): string {
  if (total < 1) return "১ মিনিটের কম";
  if (total < 60) return `${bn(total)} মিনিট`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h < 24) return m ? `${bn(h)} ঘণ্টা ${bn(m)} মিনিট` : `${bn(h)} ঘণ্টা`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh ? `${bn(d)} দিন ${bn(rh)} ঘণ্টা` : `${bn(d)} দিন`;
}

/** Minutes a "new" case has been waiting for an officer. */
export const waitingMinutes = (e: Escalation, now: number) => minutesBetween(e.createdAt, now);
export const isOverdue = (e: Escalation, now: number, slaMinutes: number) => e.status === "new" && waitingMinutes(e, now) > slaMinutes;

/** Time column: waiting (new) / running (ongoing) / total handling time (resolved). */
export function timingLabel(e: Escalation, now: number): { prefix: string; text: string } {
  if (e.status === "new") return { prefix: "অপেক্ষা", text: fmtMinutes(waitingMinutes(e, now)) };
  if (e.status === "ongoing") return { prefix: "চলছে", text: fmtMinutes(minutesBetween(e.acceptedAt ?? e.createdAt, now)) };
  return { prefix: "সমাধানে", text: fmtMinutes(minutesBetween(e.createdAt, e.resolvedAt ?? now)) };
}

export const firstResponseMinutes = (e: Escalation): number | null =>
  e.acceptedAt ? minutesBetween(e.createdAt, e.acceptedAt) : null;
export const resolutionMinutes = (e: Escalation): number | null =>
  e.resolvedAt ? minutesBetween(e.createdAt, e.resolvedAt) : null;

export function average(values: (number | null)[]): number | null {
  const v = values.filter((x): x is number => x !== null);
  return v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length) : null;
}

/* ---------------- CSV ---------------- */

const STATUS_CSV = { new: "নতুন", ongoing: "চলমান", resolved: "সমাধান হয়েছে" } as const;

export function escalationsToCsv(rows: Escalation[]): string {
  const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const header = ["আইডি", "তৈরির সময় (ISO)", "প্রশ্ন", "নাগরিক", "বিভাগ", "অগ্রাধিকার", "স্ট্যাটাস", "দায়িত্বপ্রাপ্ত", "প্রথম সাড়া (মিনিট)", "সমাধানের সময় (মিনিট)", "সমাধানের সারসংক্ষেপ"];
  const lines = rows.map((e) =>
    [e.id, e.createdAt, e.question, e.citizen, e.dept, PRIORITY_META[e.priority].label, STATUS_CSV[e.status], e.assignee ?? "", firstResponseMinutes(e) ?? "", resolutionMinutes(e) ?? "", e.resolution]
      .map(q)
      .join(","),
  );
  return "﻿" + [header.map(q).join(","), ...lines].join("\r\n");
}
