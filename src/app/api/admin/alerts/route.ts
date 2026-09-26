import { route } from "@/server/http";
import { requireUser } from "@/server/auth";
import { col } from "@/server/db";
import { getSettings } from "@/server/settings";
import { workingMinutesBetween } from "@/lib/settings";

/** Tiny poll target for the staff panel: how many hand-offs are waiting, and how many are past the SLA. */
export const GET = route(async () => {
  await requireUser();
  const [s, waiting] = await Promise.all([getSettings(), (await col.escalations()).find({ status: "new" }, { projection: { question: 1, createdAt: 1 } }).sort({ createdAt: -1 }).toArray()]);
  const now = Date.now();
  const overdue = waiting.filter((e) => workingMinutesBetween(new Date(e.createdAt).getTime(), now, s.hours) > s.slaMinutes).length;
  return { newCount: waiting.length, overdueCount: overdue, latest: waiting[0] ? { id: waiting[0]._id, question: waiting[0].question } : null };
});
