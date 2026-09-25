import "server-only";
import { col } from "./db";
import { checkPasswordStrength } from "./auth";

export interface HealthReport {
  ok: boolean;
  db: { ok: boolean; error?: string; name: string };
  data?: { users: number; admins: number; conversations: number; escalations: number; kb: number };
  problems: string[];
}

/** Static configuration problems (no secrets are ever included in the messages). */
export function configProblems(hasAdmin: boolean): string[] {
  const p: string[] = [];
  const secret = process.env.SESSION_SECRET;
  if (!secret) p.push("SESSION_SECRET is missing — nobody can sign in.");
  else if (secret.length < 32) p.push(`SESSION_SECRET is too short (${secret.length} chars; need at least 32) — nobody can sign in.`);
  if (!process.env.CRON_SECRET) p.push("CRON_SECRET is missing — the daily retention job will be rejected.");
  if (!hasAdmin) {
    const email = process.env.ADMIN_EMAIL?.trim();
    const pw = process.env.ADMIN_PASSWORD;
    if (!email) p.push("No admin exists yet and ADMIN_EMAIL is missing, so no first admin can be created.");
    else if (!/^\S+@\S+\.\S+$/.test(email)) p.push("ADMIN_EMAIL does not look like an email address.");
    if (!pw) p.push("No admin exists yet and ADMIN_PASSWORD is missing, so no first admin can be created.");
    else {
      const weak = checkPasswordStrength(pw);
      if (weak) p.push(`ADMIN_PASSWORD is not accepted: ${weak}`);
      if (pw !== pw.trim()) p.push("ADMIN_PASSWORD has leading/trailing spaces (check the value pasted into Vercel).");
    }
  }
  return p;
}

export async function healthReport(): Promise<HealthReport> {
  const name = process.env.MONGODB_DB || "seba_sohayok";
  try {
    const [users, conversations, escalations, kb] = await Promise.all([col.users(), col.conversations(), col.escalations(), col.kb()]);
    const [u, a, c, e, k] = await Promise.all([users.countDocuments(), users.countDocuments({ role: "admin", active: true }), conversations.estimatedDocumentCount(), escalations.estimatedDocumentCount(), kb.estimatedDocumentCount()]);
    const problems = configProblems(a > 0);
    if (k === 0) problems.push("The knowledge base is empty — the bot will only know the built-in topic answers. Run `npm run seed -- --kb` against this database.");
    return { ok: problems.length === 0, db: { ok: true, name }, data: { users: u, admins: a, conversations: c, escalations: e, kb: k }, problems };
  } catch (err) {
    return { ok: false, db: { ok: false, name, error: err instanceof Error ? `${err.name}: ${err.message.split("\n")[0].slice(0, 160)}` : "unknown error" }, problems: configProblems(false) };
  }
}
