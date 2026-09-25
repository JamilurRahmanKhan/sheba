import { route } from "@/server/http";
import { getSettings } from "@/server/settings";
import { FAQ_TOPICS } from "@/lib/data";
import { hoursSummary, withinWorkingHours } from "@/lib/settings";

/** Everything the citizen chat needs to render. No secrets, nothing about staff. */
export const GET = route(async () => {
  const s = await getSettings();
  return {
    greeting: s.bot.greeting,
    maintenance: s.bot.maintenance,
    handoffEnabled: s.handoff.enabled,
    offHoursMessage: s.handoff.offHoursMessage,
    slaMinutes: s.slaMinutes,
    inHours: withinWorkingHours(s.hours),
    hoursSummary: hoursSummary(s.hours),
    topics: FAQ_TOPICS.map((t) => ({ id: t.id, label: t.label, sample: t.sample })),
  };
});
