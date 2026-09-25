import { z } from "zod";
import { randomBytes } from "node:crypto";
import { ApiError, body, route } from "@/server/http";
import { checkPasswordStrength, hashPassword, requireUser, toTeamMember } from "@/server/auth";
import { col } from "@/server/db";

/** Everyone signed in can see the team (needed to assign cases); only admins can change it. */
export const GET = route(async () => {
  await requireUser();
  const users = await (await col.users()).find({}).sort({ createdAt: 1 }).toArray();
  return { team: users.map(toTeamMember) };
});

const schema = z.object({
  name: z.string().trim().min(2, "নাম লিখুন।").max(80),
  email: z.string().trim().toLowerCase().email("সঠিক ইমেইল দিন।").max(200),
  password: z.string().max(200),
  role: z.enum(["admin", "officer"]).default("officer"),
  title: z.string().trim().max(100).default(""),
});

export const POST = route(async (req) => {
  await requireUser("admin");
  const input = await body(req, schema);
  const weak = checkPasswordStrength(input.password);
  if (weak) throw new ApiError(400, weak);
  const users = await col.users();
  if (await users.findOne({ $or: [{ email: input.email }, { name: input.name }] }, { projection: { _id: 1 } })) throw new ApiError(409, "এই নাম বা ইমেইল দিয়ে আগে থেকেই একজন সদস্য আছেন।");
  const doc = { _id: `u-${randomBytes(6).toString("hex")}`, email: input.email, name: input.name, role: input.role, title: input.title, active: true, passwordHash: await hashPassword(input.password), createdAt: new Date().toISOString(), failedLogins: 0 };
  await users.insertOne(doc);
  return { member: toTeamMember(doc) };
});
