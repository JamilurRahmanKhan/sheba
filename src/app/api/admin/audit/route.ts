import { query, route } from "@/server/http";
import { requireUser } from "@/server/auth";
import { auditQuery, listAudit } from "@/server/audit";

export const GET = route(async (req) => {
  await requireUser("admin");
  return listAudit(query(req, auditQuery));
});
