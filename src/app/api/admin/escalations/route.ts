import { query, route } from "@/server/http";
import { requireUser } from "@/server/auth";
import { escalationQuery, listEscalations } from "@/server/queries";

export const GET = route(async (req) => {
  const me = await requireUser();
  return listEscalations(query(req, escalationQuery), me.name);
});
