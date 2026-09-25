import { z } from "zod";
import { ApiError, body, route } from "@/server/http";
import { checkPasswordStrength, hashPassword, requireUser, verifyPassword } from "@/server/auth";
import { col } from "@/server/db";

const schema = z.object({ current: z.string().min(1).max(200), next: z.string().max(200) });

export const POST = route(async (req) => {
  const me = await requireUser();
  const { current, next } = await body(req, schema);
  const weak = checkPasswordStrength(next);
  if (weak) throw new ApiError(400, weak);
  const users = await col.users();
  const user = await users.findOne({ _id: me.id });
  if (!user || !(await verifyPassword(current, user.passwordHash))) throw new ApiError(400, "বর্তমান পাসওয়ার্ড সঠিক নয়।");
  await users.updateOne({ _id: me.id }, { $set: { passwordHash: await hashPassword(next) } });
  return { ok: true };
});
