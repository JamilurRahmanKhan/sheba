import { z } from "zod";
import { ApiError, body, route } from "@/server/http";
import { requireUser } from "@/server/auth";
import { getSettings, saveSettings } from "@/server/settings";
import { mergeSettings, validateSettings } from "@/lib/settings";

export const GET = route(async () => {
  await requireUser();
  return { settings: await getSettings() };
});

const schema = z.object({
  org: z.object({ panelTitle: z.string().max(100), departmentName: z.string().max(150) }),
  slaMinutes: z.number(),
  hours: z.object({ enabled: z.boolean(), days: z.array(z.number().int().min(0).max(6)).max(7), start: z.string().max(5), end: z.string().max(5) }),
  handoff: z.object({ enabled: z.boolean(), offHoursMessage: z.string().max(1000) }),
  bot: z.object({ greeting: z.string().max(1000), fallback: z.string().max(1000), maintenance: z.boolean(), maintenanceMessage: z.string().max(1000) }),
  retentionDays: z.number(),
});

export const PUT = route(async (req) => {
  await requireUser("admin");
  const next = mergeSettings(await body(req, schema));
  const errors = validateSettings(next);
  const first = Object.values(errors)[0];
  if (first) throw new ApiError(400, first);
  await saveSettings(next);
  return { settings: next };
});
