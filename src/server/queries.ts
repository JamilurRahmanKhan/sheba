import "server-only";
import type { Filter } from "mongodb";
import { z } from "zod";
import { col, type ConversationDoc } from "./db";
import { toEscalation } from "./escalations";
import { getSettings } from "./settings";
import { labelFor, type Escalation, type EscStatus } from "@/lib/data";
import type { ConversationSummary, Outcome } from "@/lib/conversations";
import { average, firstResponseMinutes, isOverdue, resolutionMinutes } from "@/lib/escalations";

const DHAKA_OFFSET_MS = 6 * 3600_000;
export const startOfDhakaDay = (ms = Date.now()) => {
  const d = new Date(ms + DHAKA_OFFSET_MS);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime() - DHAKA_OFFSET_MS;
};
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* ---------------- conversations ---------------- */

export const conversationQuery = z.object({
  q: z.string().max(200).default(""),
  topic: z.string().max(40).default("all"),
  outcome: z.enum(["all", "resolved", "escalated", "unanswered"]).default("all"),
  period: z.enum(["all", "today", "7d", "30d"]).default("all"),
  review: z.enum(["all", "pending", "done", "flagged"]).default("all"),
  sort: z.enum(["new", "old", "long", "rating"]).default("new"),
  page: z.coerce.number().int().min(0).default(0),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});
export type ConversationQuery = z.infer<typeof conversationQuery>;

export function summarize(d: ConversationDoc): ConversationSummary {
  return {
    id: d._id,
    startedAt: d.startedAt,
    lang: d.lang,
    topic: d.topic,
    firstQuestion: d.firstQuestion,
    messageCount: d.messageCount,
    userMessages: d.userMessages,
    outcome: d.outcome,
    rating: d.rating,
    reviewed: d.reviewed,
    flagged: d.flagged,
    note: d.note,
    escalated: d.escalated,
    escalationId: d.escalationId,
    kbAdded: d.kbAdded,
  };
}

function conversationFilter(p: ConversationQuery): Filter<ConversationDoc> {
  const base: Filter<ConversationDoc> = {};
  if (p.period === "today") base.startedAt = { $gte: new Date(startOfDhakaDay()).toISOString() };
  else if (p.period !== "all") base.startedAt = { $gte: new Date(Date.now() - (p.period === "7d" ? 7 : 30) * 86_400_000).toISOString() };
  if (p.topic === "none") base.topic = null;
  else if (p.topic !== "all") base.topic = p.topic as ConversationDoc["topic"];
  if (p.review === "pending") base.reviewed = false;
  if (p.review === "done") base.reviewed = true;
  if (p.review === "flagged") base.flagged = true;
  const q = p.q.trim();
  if (q) {
    const re = escapeRegex(q);
    base.$or = [{ searchText: { $regex: re.toLowerCase() } }, { _id: { $regex: re, $options: "i" } }, { note: { $regex: re, $options: "i" } }];
  }

  return base;
}

export async function listConversations(p: ConversationQuery) {
  const conversations = await col.conversations();
  const base = conversationFilter(p);
  const light = await conversations.find(base, { projection: { outcome: 1, startedAt: 1, userMessages: 1, rating: 1 } }).toArray();
  const counts: Record<Outcome, number> = { resolved: 0, escalated: 0, unanswered: 0 };
  light.forEach((d) => (counts[d.outcome] += 1));

  const rows = p.outcome === "all" ? light : light.filter((d) => d.outcome === p.outcome);
  const t = (d: { startedAt: string }) => new Date(d.startedAt).getTime();
  rows.sort((a, b) => {
    if (p.sort === "old") return t(a) - t(b);
    if (p.sort === "long") return b.userMessages - a.userMessages || t(b) - t(a);
    if (p.sort === "rating") return (a.rating ?? 99) - (b.rating ?? 99) || t(b) - t(a);
    return t(b) - t(a);
  });
  const rated = rows.filter((d) => d.rating);
  const avgRating = rated.length ? rated.reduce((s, d) => s + (d.rating ?? 0), 0) / rated.length : null;

  const totalPages = Math.max(1, Math.ceil(rows.length / p.pageSize));
  const page = Math.min(p.page, totalPages - 1);
  const ids = rows.slice(page * p.pageSize, (page + 1) * p.pageSize).map((d) => d._id);
  const docs = await conversations.find({ _id: { $in: ids } }, { projection: { messages: 0, tokenHash: 0, searchText: 0 } }).toArray();
  const byId = new Map(docs.map((d) => [d._id, d]));

  return {
    items: ids.map((id) => summarize(byId.get(id) as ConversationDoc)),
    total: rows.length,
    page,
    baseTotal: light.length,
    counts,
    ratedCount: rated.length,
    satisfiedCount: rated.filter((d) => (d.rating ?? 0) >= 4).length,
    avgRating,
    pendingReview: await conversations.countDocuments({ reviewed: false }),
  };
}

/* ---------------- escalations ---------------- */

export const escalationQuery = z.object({
  q: z.string().max(200).default(""),
  dept: z.string().max(80).default("all"),
  priority: z.enum(["all", "normal", "urgent"]).default("all"),
  assignee: z.string().max(80).default("all"), // all | mine | unassigned | <name>
  status: z.enum(["all", "new", "ongoing", "resolved"]).default("all"),
  sort: z.enum(["queue", "new", "old"]).default("queue"),
  page: z.coerce.number().int().min(0).default(0),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});
export type EscalationQuery = z.infer<typeof escalationQuery>;

const STATUS_ORDER: Record<EscStatus, number> = { new: 0, ongoing: 1, resolved: 2 };

function escalationFilter(p: EscalationQuery, meName: string): Filter<import("./db").EscalationDoc> {
  const base: Filter<import("./db").EscalationDoc> = {};
  if (p.dept !== "all") base.dept = p.dept;
  if (p.priority !== "all") base.priority = p.priority;
  if (p.assignee === "mine") base.assignee = meName;
  else if (p.assignee === "unassigned") base.assignee = null;
  else if (p.assignee !== "all") base.assignee = p.assignee;
  const q = p.q.trim();
  if (q) {
    const re = { $regex: escapeRegex(q), $options: "i" };
    base.$or = [{ _id: re }, { question: re }, { citizen: re }, { dept: re }];
  }

  return base;
}

export async function listEscalations(p: EscalationQuery, meName: string) {
  const escalations = await col.escalations();
  const settings = await getSettings();
  const base = escalationFilter(p, meName);
  const all = (await escalations.find(base).toArray()).map(toEscalation);
  const nowMs = Date.now();
  const stats = {
    counts: { new: 0, ongoing: 0, resolved: 0 } as Record<EscStatus, number>,
    overdue: all.filter((e) => isOverdue(e, nowMs, settings.slaMinutes, settings.hours)).length,
    urgentOpen: all.filter((e) => e.priority === "urgent" && e.status !== "resolved").length,
    avgResponse: average(all.map((e) => firstResponseMinutes(e, settings.hours))),
    avgResolution: average(all.map((e) => resolutionMinutes(e, settings.hours))),
  };
  all.forEach((e) => (stats.counts[e.status] += 1));

  const rows = p.status === "all" ? [...all] : all.filter((e) => e.status === p.status);
  const t = (e: Escalation) => new Date(e.createdAt).getTime();
  rows.sort((a, b) => {
    if (p.sort === "new") return t(b) - t(a);
    if (p.sort === "old") return t(a) - t(b);
    if (a.status !== b.status) return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (a.status === "resolved") return t(b) - t(a);
    if (a.priority !== b.priority) return a.priority === "urgent" ? -1 : 1;
    return t(a) - t(b);
  });

  const totalPages = Math.max(1, Math.ceil(rows.length / p.pageSize));
  const page = Math.min(p.page, totalPages - 1);
  return {
    items: rows.slice(page * p.pageSize, (page + 1) * p.pageSize),
    total: rows.length,
    page,
    baseTotal: all.length,
    stats,
    depts: (await escalations.distinct("dept")).sort((a, b) => a.localeCompare(b, "bn")),
    slaMinutes: settings.slaMinutes,
    hours: settings.hours,
  };
}

/* ---------------- dashboard ---------------- */

export async function dashboardStats() {
  const conversations = await col.conversations();
  const escalations = await col.escalations();
  const nowMs = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  const day = 86_400_000;

  const [today, recent, prevWeek, thisWeek, ratedAgg, escCounts] = await Promise.all([
    conversations.countDocuments({ startedAt: { $gte: iso(startOfDhakaDay()) } }),
    conversations.aggregate<{ _id: string | null; n: number }>([{ $match: { startedAt: { $gte: iso(nowMs - 30 * day) } } }, { $group: { _id: "$topic", n: { $sum: 1 } } }]).toArray(),
    conversations.aggregate<{ _id: Outcome; n: number }>([{ $match: { startedAt: { $gte: iso(nowMs - 14 * day), $lt: iso(nowMs - 7 * day) } } }, { $group: { _id: "$outcome", n: { $sum: 1 } } }]).toArray(),
    conversations.aggregate<{ _id: Outcome; n: number }>([{ $match: { startedAt: { $gte: iso(nowMs - 7 * day) } } }, { $group: { _id: "$outcome", n: { $sum: 1 } } }]).toArray(),
    conversations.aggregate<{ _id: null; avg: number; n: number }>([{ $match: { rating: { $gte: 1 } } }, { $group: { _id: null, avg: { $avg: "$rating" }, n: { $sum: 1 } } }]).toArray(),
    escalations.aggregate<{ _id: EscStatus; n: number }>([{ $group: { _id: "$status", n: { $sum: 1 } } }]).toArray(),
  ]);

  const rate = (rows: { _id: Outcome; n: number }[]) => {
    const total = rows.reduce((s, r) => s + r.n, 0);
    const ok = rows.find((r) => r._id === "resolved")?.n ?? 0;
    return total ? (ok / total) * 100 : null;
  };
  const count = (rows: { n: number }[]) => rows.reduce((s, r) => s + r.n, 0);
  const MIN_SAMPLE = 10; // below this a percentage (or a week-on-week change) is noise
  const thisN = count(thisWeek);
  const thisRate = thisN >= MIN_SAMPLE ? rate(thisWeek) : null;
  const prevRate = count(prevWeek) >= MIN_SAMPLE ? rate(prevWeek) : null;

  const total30 = recent.reduce((s, r) => s + r.n, 0);
  const named = recent.filter((r) => r._id).sort((a, b) => b.n - a.n);
  const top = named.slice(0, 5);
  const otherN = total30 - top.reduce((s, r) => s + r.n, 0);
  const rows = [...top.map((r) => ({ label: labelFor(r._id as string), n: r.n })), ...(otherN > 0 ? [{ label: "অন্যান্য", n: otherN }] : [])];
  const max = Math.max(1, ...rows.map((r) => r.n));

  const esc = { new: 0, ongoing: 0, resolved: 0 } as Record<EscStatus, number>;
  escCounts.forEach((r) => (esc[r._id] = r.n));

  return {
    conversationsToday: today,
    escalations: esc,
    topics: rows.map((r) => ({ label: r.label, share: total30 ? Math.round((r.n / total30) * 100) : 0, width: Math.round((r.n / max) * 100) })),
    aiResolveRate: thisRate === null ? null : Math.round(thisRate),
    aiResolveSample: thisN,
    aiResolveDelta: thisRate !== null && prevRate !== null ? Math.round(thisRate - prevRate) : null,
    avgRating: ratedAgg[0] ? Math.round(ratedAgg[0].avg * 10) / 10 : null,
    ratingCount: ratedAgg[0]?.n ?? 0,
  };
}

/** Full (transcript-included) rows for a CSV export, honouring the same filters and sort as the list. */
export async function exportConversations(p: ConversationQuery) {
  const conversations = await col.conversations();
  const docs = await conversations.find(conversationFilter(p), { projection: { tokenHash: 0, searchText: 0 } }).limit(5000).toArray();
  const rows = p.outcome === "all" ? docs : docs.filter((d) => d.outcome === p.outcome);
  const t = (d: { startedAt: string }) => new Date(d.startedAt).getTime();
  rows.sort((a, b) => {
    if (p.sort === "old") return t(a) - t(b);
    if (p.sort === "long") return b.userMessages - a.userMessages || t(b) - t(a);
    if (p.sort === "rating") return (a.rating ?? 99) - (b.rating ?? 99) || t(b) - t(a);
    return t(b) - t(a);
  });
  return rows;
}

export async function exportEscalations(p: EscalationQuery, meName: string) {
  const escalations = await col.escalations();
  const base = escalationFilter(p, meName);
  const all = (await escalations.find(base).limit(5000).toArray()).map(toEscalation);
  const rows = p.status === "all" ? all : all.filter((e) => e.status === p.status);
  return rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
