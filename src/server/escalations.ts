import "server-only";
import { col, type EscalationDoc } from "./db";
import type { SessionUser } from "./auth";
import { derived } from "./chat";
import { conflict, notFound, badRequest } from "./http";
import { fmtClock, type LogMessage } from "@/lib/conversations";
import type { Escalation, Priority } from "@/lib/data";

const now = () => new Date().toISOString();

export function toEscalation(d: EscalationDoc): Escalation {
  const { _id, conversationId, ...rest } = d;
  void conversationId;
  return { ...rest, id: _id, time: fmtClock(new Date(d.createdAt)) };
}

async function appendToConversation(escId: string, msgs: LogMessage[]) {
  const esc = await (await col.escalations()).findOne({ _id: escId }, { projection: { conversationId: 1 } });
  if (!esc?.conversationId || msgs.length === 0) return;
  const conversations = await col.conversations();
  const conv = await conversations.findOne({ _id: esc.conversationId }, { projection: { messages: 1, escalated: 1 } });
  if (!conv) return;
  const all = [...conv.messages, ...msgs];
  await conversations.updateOne({ _id: esc.conversationId }, { $set: derived(all, conv.escalated), $push: { messages: { $each: msgs } } });
}

async function must(id: string): Promise<EscalationDoc> {
  const e = await (await col.escalations()).findOne({ _id: id });
  if (!e) throw notFound("হস্তান্তর পাওয়া যায়নি।");
  return e;
}

export async function acceptEscalation(id: string, user: SessionUser) {
  const at = now();
  const res = await (await col.escalations()).findOneAndUpdate(
    { _id: id, status: "new" },
    { $set: { status: "ongoing", assignee: user.name, acceptedAt: at }, $push: { activity: { at, kind: "event", text: `${user.name} হস্তান্তরটি গ্রহণ করেছেন`, by: user.name } } },
    { returnDocument: "after" },
  );
  if (!res) {
    await must(id);
    throw conflict("এই হস্তান্তরটি ইতিমধ্যে অন্য কেউ গ্রহণ করেছেন।");
  }
  await appendToConversation(id, [{ role: "system", admin: true, text: `প্রতিনিধি ${user.name} কথোপকথনে যুক্ত হয়েছেন।`, at }]);
  return res;
}

export async function resolveEscalation(id: string, resolution: string, user: SessionUser) {
  const text = resolution.trim();
  if (!text) throw badRequest("সমাধানের সারসংক্ষেপ লিখুন।");
  const at = now();
  const cur = await must(id);
  const res = await (await col.escalations()).findOneAndUpdate(
    { _id: id, status: { $ne: "resolved" } },
    {
      $set: { status: "resolved", resolvedAt: at, resolution: text, acceptedAt: cur.acceptedAt ?? at, assignee: cur.assignee ?? user.name },
      $push: { activity: { at, kind: "event", text: "সমাধান হিসেবে চিহ্নিত করা হয়েছে", by: user.name } },
    },
    { returnDocument: "after" },
  );
  if (!res) throw conflict("হস্তান্তরটি ইতিমধ্যে সমাধান হয়ে গেছে।");
  await appendToConversation(id, [{ role: "system", admin: true, text: "আপনার প্রশ্নটি সমাধান হিসেবে চিহ্নিত করা হয়েছে। ধন্যবাদ।", at }]);
  return res;
}

export async function reopenEscalation(id: string, user: SessionUser) {
  const at = now();
  const res = await (await col.escalations()).findOneAndUpdate(
    { _id: id, status: "resolved" },
    { $set: { status: "ongoing", resolvedAt: null }, $push: { activity: { at, kind: "event", text: "হস্তান্তরটি পুনরায় খোলা হয়েছে", by: user.name } } },
    { returnDocument: "after" },
  );
  if (!res) {
    await must(id);
    throw conflict("শুধু সমাধান হওয়া হস্তান্তর পুনরায় খোলা যায়।");
  }
  await appendToConversation(id, [{ role: "system", admin: true, text: "আপনার প্রশ্নটি পুনরায় খোলা হয়েছে।", at }]);
  return res;
}

export async function setPriority(id: string, priority: Priority, user: SessionUser) {
  const at = now();
  const res = await (await col.escalations()).findOneAndUpdate(
    { _id: id },
    { $set: { priority }, $push: { activity: { at, kind: "event", text: priority === "urgent" ? "জরুরি হিসেবে চিহ্নিত করা হয়েছে" : "অগ্রাধিকার সাধারণ করা হয়েছে", by: user.name } } },
    { returnDocument: "after" },
  );
  if (!res) throw notFound("হস্তান্তর পাওয়া যায়নি।");
  return res;
}

export async function assignEscalation(id: string, assignee: string | null, user: SessionUser) {
  if (assignee) {
    const u = await (await col.users()).findOne({ name: assignee, active: true }, { projection: { _id: 1 } });
    if (!u) throw badRequest("এই নামে কোনো সক্রিয় সদস্য নেই।");
  }
  const at = now();
  const res = await (await col.escalations()).findOneAndUpdate(
    { _id: id },
    { $set: { assignee }, $push: { activity: { at, kind: "event", text: assignee ? `${assignee}-কে দায়িত্ব দেওয়া হয়েছে` : "দায়িত্ব সরিয়ে নেওয়া হয়েছে", by: user.name } } },
    { returnDocument: "after" },
  );
  if (!res) throw notFound("হস্তান্তর পাওয়া যায়নি।");
  return res;
}

export async function addNote(id: string, text: string, user: SessionUser) {
  const res = await (await col.escalations()).findOneAndUpdate({ _id: id }, { $push: { activity: { at: now(), kind: "note", text: text.trim(), by: user.name } } }, { returnDocument: "after" });
  if (!res) throw notFound("হস্তান্তর পাওয়া যায়নি।");
  return res;
}

export async function markKbAdded(id: string, user: SessionUser) {
  const res = await (await col.escalations()).findOneAndUpdate(
    { _id: id },
    { $set: { kbAdded: true }, $push: { activity: { at: now(), kind: "event", text: "সমাধানটি নলেজ বেসে যোগ করা হয়েছে", by: user.name } } },
    { returnDocument: "after" },
  );
  if (!res) throw notFound("হস্তান্তর পাওয়া যায়নি।");
  return res;
}

/** A representative's reply, delivered into the citizen's chat. Only allowed while the case is being handled. */
export async function replyToCitizen(id: string, text: string, user: SessionUser) {
  const esc = await must(id);
  if (esc.status !== "ongoing") throw conflict("উত্তর দিতে হস্তান্তরটি আগে গ্রহণ করুন (এবং সমাধান না হওয়া পর্যন্ত)।");
  if (!esc.conversationId) throw badRequest("এই হস্তান্তরের সাথে কোনো কথোপকথন সংযুক্ত নেই।");
  await appendToConversation(id, [{ role: "agent", text: text.trim(), at: now(), agent: user.name }]);
}
