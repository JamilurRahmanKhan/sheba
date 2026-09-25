import { route } from "@/server/http";
import { requireUser } from "@/server/auth";
import { col } from "@/server/db";
import { getSettings } from "@/server/settings";
import { countPurgeable } from "@/server/data";

export const GET = route(async () => {
  await requireUser("admin");
  const s = await getSettings();
  const [conversations, escalations, kb] = await Promise.all([
    (await col.conversations()).estimatedDocumentCount(),
    (await col.escalations()).estimatedDocumentCount(),
    (await col.kb()).estimatedDocumentCount(),
  ]);
  return { conversations, escalations, kb, retentionDays: s.retentionDays, purgeable: await countPurgeable(s.retentionDays) };
});
