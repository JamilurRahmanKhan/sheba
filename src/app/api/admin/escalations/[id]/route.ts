import { z } from "zod";
import { body, notFound, route } from "@/server/http";
import { requireUser } from "@/server/auth";
import { col } from "@/server/db";
import { toConversation } from "@/server/chat";
import { acceptEscalation, addNote, assignEscalation, markKbAdded, reopenEscalation, replyToCitizen, resolveEscalation, setPriority, toEscalation } from "@/server/escalations";

async function detail(id: string) {
  const esc = await (await col.escalations()).findOne({ _id: id });
  if (!esc) throw notFound("হস্তান্তর পাওয়া যায়নি।");
  const conv = esc.conversationId ? await (await col.conversations()).findOne({ _id: esc.conversationId }) : null;
  return { escalation: toEscalation(esc), conversation: conv ? toConversation(conv) : null };
}

export const GET = route<{ id: string }>(async (_req, { params }) => {
  await requireUser();
  return detail(params.id);
});

const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept") }),
  z.object({ action: z.literal("resolve"), resolution: z.string().max(3000) }),
  z.object({ action: z.literal("reopen") }),
  z.object({ action: z.literal("priority"), priority: z.enum(["normal", "urgent"]) }),
  z.object({ action: z.literal("assign"), assignee: z.string().max(100).nullable() }),
  z.object({ action: z.literal("note"), text: z.string().trim().min(1).max(2000) }),
  z.object({ action: z.literal("reply"), text: z.string().trim().min(1).max(2000) }),
  z.object({ action: z.literal("kbAdded") }),
]);

export const POST = route<{ id: string }>(async (req, { params }) => {
  const me = await requireUser();
  const a = await body(req, action);
  const id = params.id;
  switch (a.action) {
    case "accept": await acceptEscalation(id, me); break;
    case "resolve": await resolveEscalation(id, a.resolution, me); break;
    case "reopen": await reopenEscalation(id, me); break;
    case "priority": await setPriority(id, a.priority, me); break;
    case "assign": await assignEscalation(id, a.assignee, me); break;
    case "note": await addNote(id, a.text, me); break;
    case "reply": await replyToCitizen(id, a.text, me); break;
    case "kbAdded": await markKbAdded(id, me); break;
  }
  return detail(id);
});
