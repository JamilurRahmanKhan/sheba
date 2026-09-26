import { route } from "@/server/http";
import { requireUser } from "@/server/auth";
import { audit } from "@/server/audit";
import { getSettings } from "@/server/settings";
import { purgeOldConversations } from "@/server/data";

export const POST = route(async () => {
  const me = await requireUser("admin");
  const { retentionDays } = await getSettings();
  const deleted = await purgeOldConversations(retentionDays);
  await audit(me, "data.purge", `${deleted}টি পুরনো কথোপকথন মুছে ফেলা হয়েছে (${retentionDays} দিনের বেশি পুরনো)`);
  return { deleted };
});
