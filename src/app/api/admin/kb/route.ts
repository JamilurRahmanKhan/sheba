import { body, conflict, route } from "@/server/http";
import { requireUser } from "@/server/auth";
import { audit } from "@/server/audit";
import { col, nextSeq } from "@/server/db";
import { kbSchema } from "@/server/schemas";

export const GET = route(async () => {
  await requireUser();
  const items = await (await col.kb()).find({}).sort({ updated: -1, _id: 1 }).toArray();
  return { items: items.map(({ _id, ...k }) => ({ id: _id, ...k })) };
});

export const POST = route(async (req) => {
  const me = await requireUser();
  const input = await body(req, kbSchema);
  const dup = await (await col.kb()).findOne({ question: input.question }, { collation: { locale: "en", strength: 2 }, projection: { _id: 1 } });
  if (dup) throw conflict("এই প্রশ্নটি নলেজ বেসে ইতিমধ্যে আছে। বিদ্যমান এন্ট্রি এডিট করুন বা বিকল্প প্রশ্ন যোগ করুন।");
  const id = `custom-${await nextSeq("kb", 1000)}`;
  const doc = { _id: id, ...input, uses: 0, updated: new Date().toISOString().slice(0, 10), active: true, custom: true };
  await (await col.kb()).insertOne(doc);
  await audit(me, "kb.create", input.question.slice(0, 120));
  const { _id, ...rest } = doc;
  return { item: { id: _id, ...rest } };
});
