import { route } from "@/server/http";
import { requireUser } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { purgeOldConversations } from "@/server/data";

export const POST = route(async () => {
  await requireUser("admin");
  const { retentionDays } = await getSettings();
  return { deleted: await purgeOldConversations(retentionDays) };
});
