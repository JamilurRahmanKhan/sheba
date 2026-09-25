import { z } from "zod";
import { body, notFound, route } from "@/server/http";
import { requireUser } from "@/server/auth";
import { col } from "@/server/db";
import { toConversation } from "@/server/chat";
import { toEscalation } from "@/server/escalations";

export const GET = route<{ id: string }>(async (_req, { params }) => {
  await requireUser();
  const doc = await (await col.conversations()).findOne({ _id: params.id });
  if (!doc) throw notFound("কথোপকথন পাওয়া যায়নি।");
  const esc = doc.escalationId ? await (await col.escalations()).findOne({ _id: doc.escalationId }) : null;
  return { conversation: toConversation(doc), escalation: esc ? toEscalation(esc) : null };
});

const patch = z.object({ reviewed: z.boolean().optional(), flagged: z.boolean().optional(), note: z.string().max(2000).optional(), kbAdded: z.boolean().optional() });

export const PATCH = route<{ id: string }>(async (req, { params }) => {
  await requireUser();
  const p = await body(req, patch);
  const res = await (await col.conversations()).findOneAndUpdate({ _id: params.id }, { $set: p }, { returnDocument: "after" });
  if (!res) throw notFound("কথোপকথন পাওয়া যায়নি।");
  return { conversation: toConversation(res) };
});
