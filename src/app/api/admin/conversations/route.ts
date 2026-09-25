import { query, route } from "@/server/http";
import { requireUser } from "@/server/auth";
import { conversationQuery, listConversations } from "@/server/queries";

export const GET = route(async (req) => {
  await requireUser();
  return listConversations(query(req, conversationQuery));
});
