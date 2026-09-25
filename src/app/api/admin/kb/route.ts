import { body, route } from "@/server/http";
import { requireUser } from "@/server/auth";
import { col, nextSeq } from "@/server/db";
import { kbSchema } from "@/server/schemas";

export const GET = route(async () => {
  await requireUser();
  const items = await (await col.kb()).find({}).sort({ updated: -1, _id: 1 }).toArray();
  return { items: items.map(({ _id, ...k }) => ({ id: _id, ...k })) };
});

export const POST = route(async (req) => {
  await requireUser();
  const input = await body(req, kbSchema);
  const id = `custom-${await nextSeq("kb", 1000)}`;
  const doc = { _id: id, ...input, uses: 0, updated: new Date().toISOString().slice(0, 10), active: true, custom: true };
  await (await col.kb()).insertOne(doc);
  const { _id, ...rest } = doc;
  return { item: { id: _id, ...rest } };
});
