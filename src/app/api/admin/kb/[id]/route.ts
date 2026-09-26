import { z } from "zod";
import { body, conflict, notFound, route } from "@/server/http";
import { requireUser } from "@/server/auth";
import { col } from "@/server/db";
import { kbSchema } from "@/server/schemas";

const patch = kbSchema.partial().extend({ active: z.boolean().optional() });

export const PATCH = route<{ id: string }>(async (req, { params }) => {
  await requireUser();
  const p = await body(req, patch);
  if (p.question) {
    const dup = await (await col.kb()).findOne({ question: p.question, _id: { $ne: params.id } }, { collation: { locale: "en", strength: 2 }, projection: { _id: 1 } });
    if (dup) throw conflict("এই প্রশ্নটি নলেজ বেসে ইতিমধ্যে আছে।");
  }
  const set: Record<string, unknown> = { ...p };
  // Editing content counts as an update; flipping the on/off switch does not.
  if (p.question !== undefined || p.category !== undefined || p.answer !== undefined || p.aliases !== undefined) set.updated = new Date().toISOString().slice(0, 10);
  const res = await (await col.kb()).findOneAndUpdate({ _id: params.id }, { $set: set }, { returnDocument: "after" });
  if (!res) throw notFound("এন্ট্রি পাওয়া যায়নি।");
  const { _id, ...rest } = res;
  return { item: { id: _id, ...rest } };
});

export const DELETE = route<{ id: string }>(async (_req, { params }) => {
  await requireUser();
  const res = await (await col.kb()).deleteOne({ _id: params.id });
  if (!res.deletedCount) throw notFound("এন্ট্রি পাওয়া যায়নি।");
  return { ok: true };
});
