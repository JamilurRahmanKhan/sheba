import { z } from "zod";
import { ApiError, body, notFound, route } from "@/server/http";
import { checkPasswordStrength, hashPassword, requireUser, toTeamMember } from "@/server/auth";
import { audit } from "@/server/audit";
import { col } from "@/server/db";

const patch = z.object({
  title: z.string().trim().max(100).optional(),
  active: z.boolean().optional(),
  role: z.enum(["admin", "officer"]).optional(),
  /** admin-set temporary password */
  password: z.string().max(200).optional(),
});

export const PATCH = route<{ id: string }>(async (req, { params }) => {
  const me = await requireUser("admin");
  const p = await body(req, patch);
  const users = await col.users();
  const target = await users.findOne({ _id: params.id });
  if (!target) throw notFound("সদস্য পাওয়া যায়নি।");

  const losesAdmin = (p.active === false || p.role === "officer") && target.role === "admin" && target.active;
  if (params.id === me.id && (p.active === false || p.role === "officer")) throw new ApiError(400, "নিজের অ্যাকাউন্ট নিষ্ক্রিয় করা বা নিজের অ্যাডমিন ভূমিকা সরানো যাবে না।");
  if (losesAdmin && (await users.countDocuments({ role: "admin", active: true })) <= 1) throw new ApiError(400, "কমপক্ষে একজন সক্রিয় অ্যাডমিন থাকতে হবে।");

  const set: Record<string, unknown> = {};
  const inc: Record<string, number> = {};
  if (p.title !== undefined) set.title = p.title;
  if (p.active !== undefined) set.active = p.active;
  if (p.role !== undefined) set.role = p.role;
  if (p.password !== undefined) {
    const weak = checkPasswordStrength(p.password);
    if (weak) throw new ApiError(400, weak);
    set.passwordHash = await hashPassword(p.password);
    set.failedLogins = 0;
    inc.tokenVersion = 1; // the member is signed out everywhere
  }
  const res = await users.findOneAndUpdate({ _id: params.id }, { $set: set, ...(Object.keys(inc).length ? { $inc: inc } : {}), ...(p.password !== undefined ? { $unset: { lockUntil: "" } } : {}) }, { returnDocument: "after" });
  const what = [p.title !== undefined && "পদবি", p.active !== undefined && (p.active ? "সক্রিয় করা" : "নিষ্ক্রিয় করা"), p.role !== undefined && `ভূমিকা → ${p.role === "admin" ? "অ্যাডমিন" : "অফিসার"}`].filter(Boolean).join(", ");
  if (p.password !== undefined) await audit(me, "team.password_reset", `${target.name}-এর পাসওয়ার্ড রিসেট (সব সেশন বাতিল)`);
  if (what) await audit(me, "team.update", `${target.name}: ${what}`);
  return { member: toTeamMember(res!) };
});
