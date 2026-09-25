import { z } from "zod";
import { body, clientIp, rateLimitShared, route } from "@/server/http";
import { col } from "@/server/db";
import { createSession, ensureBootstrapAdmin, hashPassword, verifyPassword } from "@/server/auth";
import { NextResponse } from "next/server";

const schema = z.object({ email: z.string().trim().toLowerCase().email().max(200), password: z.string().min(1).max(200) });

// A real bcrypt hash, so unknown emails cost the same time as wrong passwords.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hashPassword("not-a-real-password"));
const GENERIC = "ইমেইল বা পাসওয়ার্ড সঠিক নয়।";
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60_000;

export const POST = route(async (req) => {
  await rateLimitShared(`login:${clientIp(req)}`, 10, 60_000);
  const { email, password } = await body(req, schema);
  try {
    await ensureBootstrapAdmin();
  } catch (err) {
    // A setup problem (e.g. weak ADMIN_PASSWORD) must not turn every login into a 500.
    // Details are in the logs and in the protected /api/health report.
    console.error("[bootstrap-admin]", err instanceof Error ? err.message : err);
  }
  const users = await col.users();
  const user = await users.findOne({ email });

  if (!user || !user.active) {
    await verifyPassword(password, await getDummyHash());
    return NextResponse.json({ error: GENERIC }, { status: 401 });
  }
  if (user.lockUntil && new Date(user.lockUntil).getTime() > Date.now()) {
    return NextResponse.json({ error: "অনেকবার ভুল চেষ্টা হয়েছে। ১৫ মিনিট পরে আবার চেষ্টা করুন।" }, { status: 429 });
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    const fails = (user.failedLogins ?? 0) + 1;
    await users.updateOne({ _id: user._id }, fails >= MAX_FAILS ? { $set: { failedLogins: 0, lockUntil: new Date(Date.now() + LOCK_MS).toISOString() } } : { $set: { failedLogins: fails } });
    return NextResponse.json({ error: GENERIC }, { status: 401 });
  }
  await users.updateOne({ _id: user._id }, { $set: { failedLogins: 0 }, $unset: { lockUntil: "" } });
  await createSession(user);
  return { user: { id: user._id, name: user.name, email: user.email, role: user.role, title: user.title } };
});
