import { route } from "@/server/http";
import { getSessionUser } from "@/server/auth";

export const GET = route(async () => ({ user: await getSessionUser() }));
