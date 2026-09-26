import { z } from "zod";
import { ApiError, body, notFound, route } from "@/server/http";
import { requireUser } from "@/server/auth";
import { audit } from "@/server/audit";
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

/** Erase one conversation (privacy request). Admin only; refused while its hand-off case is still open. */
export const DELETE = route<{ id: string }>(async (_req, { params }) => {
  const me = await requireUser("admin");
  const conversations = await col.conversations();
  const conv = await conversations.findOne({ _id: params.id }, { projection: { escalationId: 1 } });
  if (!conv) throw notFound("কথোপকথন পাওয়া যায়নি।");
  if (conv.escalationId) {
    const open = await (await col.escalations()).findOne({ _id: conv.escalationId, status: { $ne: "resolved" } }, { projection: { _id: 1 } });
    if (open) throw new ApiError(409, "এই কথোপকথনের হস্তান্তর এখনও খোলা আছে। আগে সেটি সমাধান করুন।");
    await (await col.escalations()).updateOne({ _id: conv.escalationId }, { $unset: { conversationId: "" }, $push: { activity: { at: new Date().toISOString(), kind: "event", text: "কথোপকথনের প্রতিলিপি মুছে ফেলা হয়েছে" } } });
  }
  await conversations.deleteOne({ _id: params.id });
  await audit(me, "conversation.delete", `${params.id} স্থায়ীভাবে মুছে ফেলা হয়েছে`);
  return { ok: true };
});
