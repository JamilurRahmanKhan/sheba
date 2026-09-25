import { NextResponse } from "next/server";
import { route } from "@/server/http";
import { getSettings } from "@/server/settings";
import { purgeOldConversations } from "@/server/data";

/** Vercel Cron: daily retention sweep. Vercel sends `Authorization: Bearer $CRON_SECRET`. */
export const GET = route(async (req) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { retentionDays } = await getSettings();
  return { deleted: await purgeOldConversations(retentionDays), retentionDays };
});
