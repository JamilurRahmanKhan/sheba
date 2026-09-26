import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { col, type UserDoc } from "./db";
import { forbidden, unauthorized } from "./http";
import type { SessionUser, TeamMember } from "@/lib/settings";
export type { SessionUser };

export const SESSION_COOKIE = "seba_session";
const SESSION_DAYS = 7;

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set to a random string of at least 32 characters.");
  return new TextEncoder().encode(s);
}

/* ---------------- passwords ---------------- */

export const hashPassword = (pw: string) => bcrypt.hash(pw, 10);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

export function checkPasswordStrength(pw: string): string | null {
  if (pw.length < 8) return "পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।";
  if (pw.length > 128) return "পাসওয়ার্ড অতি দীর্ঘ।";
  return null;
}

/* ---------------- session cookie ---------------- */

export async function createSession(user: Pick<UserDoc, "_id" | "tokenVersion">): Promise<void> {
  const token = await new SignJWT({ v: user.tokenVersion ?? 0 }).setProtectedHeader({ alg: "HS256" }).setSubject(user._id).setIssuedAt().setExpirationTime(`${SESSION_DAYS}d`).sign(secret());
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

export async function destroySession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

const toSessionUser = (u: UserDoc): SessionUser => ({ id: u._id, name: u.name, email: u.email, role: u.role, title: u.title });

/** The signed-in user, re-checked against the database on every call (so deactivation takes effect immediately). */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    const user = await (await col.users()).findOne({ _id: payload.sub });
    if (!user || !user.active || (typeof payload.v === "number" ? payload.v : 0) !== (user.tokenVersion ?? 0)) return null;
    return toSessionUser(user);
  } catch {
    return null;
  }
}

export async function requireUser(...roles: SessionUser["role"][]): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw unauthorized();
  if (roles.length && !roles.includes(user.role)) throw forbidden();
  return user;
}

export const toTeamMember = (u: UserDoc): TeamMember => ({ id: u._id, email: u.email, name: u.name, role: u.role, title: u.title, active: u.active });

/* ---------------- citizen chat tokens ---------------- */

export function newChatToken(): { token: string; hash: string } {
  const token = randomBytes(24).toString("base64url");
  return { token, hash: hashToken(token) };
}

export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export function tokenMatches(token: string, hash: string): boolean {
  const a = Buffer.from(hashToken(token), "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/* ---------------- first-run admin (from env) ---------------- */

/** If there are no users yet and ADMIN_EMAIL / ADMIN_PASSWORD are set, create that admin. */
export async function ensureBootstrapAdmin(): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;
  const users = await col.users();
  if ((await users.estimatedDocumentCount()) > 0) return;
  if (checkPasswordStrength(password)) throw new Error("ADMIN_PASSWORD is too weak (min 8 chars).");
  await users.updateOne(
    { email },
    {
      $setOnInsert: {
        _id: `u-${randomBytes(6).toString("hex")}`,
        email,
        name: process.env.ADMIN_NAME?.trim() || "প্রশাসক",
        role: "admin" as const,
        title: "সিস্টেম প্রশাসক",
        active: true,
        passwordHash: await hashPassword(password),
        createdAt: new Date().toISOString(),
        failedLogins: 0,
      },
    },
    { upsert: true },
  );
}
