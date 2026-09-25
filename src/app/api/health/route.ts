import { NextResponse } from "next/server";
import { route } from "@/server/http";
import { healthReport } from "@/server/health";

/**
 * Deployment self-check. Protected with the same Bearer secret as the cron job so it can be called with
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/health
 * Reports database connectivity and configuration problems by name only — never secret values.
 */
export const GET = route(async (req) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const report = await healthReport();
  return NextResponse.json(report, { status: report.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
});
