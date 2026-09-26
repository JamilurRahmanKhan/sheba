import "server-only";
import { z } from "zod";
import { col } from "./db";

/** Records who did what. Never throws: a failing audit write must not break the action itself (it is logged). */
export async function audit(actor: { id: string; name: string }, action: string, detail?: string): Promise<void> {
  try {
    await (await col.audit()).insertOne({ at: new Date().toISOString(), actorId: actor.id, actorName: actor.name, action, detail: detail?.slice(0, 500), expireAt: new Date(Date.now() + 400 * 86_400_000) });
  } catch (err) {
    console.error("[audit] write failed:", action, err instanceof Error ? err.message : err);
  }
}

export const auditQuery = z.object({ page: z.coerce.number().int().min(0).default(0), action: z.string().max(40).default("all"), q: z.string().max(100).default("") });

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function listAudit(p: z.infer<typeof auditQuery>, pageSize = 25) {
  const audits = await col.audit();
  const filter: Record<string, unknown> = {};
  if (p.action !== "all") filter.action = p.action.endsWith(".*") ? { $regex: `^${esc(p.action.slice(0, -2))}\\.` } : p.action;
  if (p.q.trim()) filter.$or = [{ actorName: { $regex: esc(p.q.trim()), $options: "i" } }, { detail: { $regex: esc(p.q.trim()), $options: "i" } }];
  const total = await audits.countDocuments(filter);
  const items = await audits.find(filter, { projection: { expireAt: 0 } }).sort({ at: -1, _id: -1 }).skip(p.page * pageSize).limit(pageSize).toArray();
  return { total, pageSize, items: items.map(({ _id, ...r }) => ({ id: String(_id), ...r })) };
}
