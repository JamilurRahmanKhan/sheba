import { NextResponse } from "next/server";
import { query, route } from "@/server/http";
import { requireUser } from "@/server/auth";
import { escalationQuery, exportEscalations } from "@/server/queries";
import { escalationsToCsv } from "@/lib/escalations";

export const GET = route(async (req) => {
  const me = await requireUser();
  const rows = await exportEscalations(query(req, escalationQuery), me.name);
  return new NextResponse(escalationsToCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="handoffs-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
