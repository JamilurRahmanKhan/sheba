import { NextResponse } from "next/server";
import { query, route } from "@/server/http";
import { requireUser } from "@/server/auth";
import { conversationQuery, exportConversations } from "@/server/queries";
import { toConversation } from "@/server/chat";
import { toCsv } from "@/lib/conversations";

export const GET = route(async (req) => {
  await requireUser();
  const rows = await exportConversations(query(req, conversationQuery));
  return new NextResponse(toCsv(rows.map(toConversation)), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="conversation-log-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
