import { route } from "@/server/http";
import { requireUser } from "@/server/auth";
import { dashboardStats } from "@/server/queries";

export const GET = route(async () => {
  await requireUser();
  return dashboardStats();
});
