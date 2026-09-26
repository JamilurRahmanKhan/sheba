import { body, route } from "@/server/http";
import { z } from "zod";
import { destroySession, requireUser } from "@/server/auth";
import { audit } from "@/server/audit";
import { col } from "@/server/db";

/** "Sign out everywhere": invalidates every session of this account, including this one. */
export const POST = route(async (req) => {
  const me = await requireUser();
  await body(req, z.object({}));
  await (await col.users()).updateOne({ _id: me.id }, { $inc: { tokenVersion: 1 } });
  await destroySession();
  await audit(me, "auth.logout_all", "সব ডিভাইস থেকে লগআউট");
  return { ok: true };
});
