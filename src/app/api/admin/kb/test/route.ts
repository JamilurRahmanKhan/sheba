import { z } from "zod";
import { body, route } from "@/server/http";
import { requireUser } from "@/server/auth";
import { col } from "@/server/db";
import { answerQuestion } from "@/server/bot";
import { getSettings } from "@/server/settings";

/** "Test the bot": what would it say to this question right now? Read-only — no usage counters, nothing stored. */
export const POST = route(async (req) => {
  await requireUser();
  const { text } = await body(req, z.object({ text: z.string().trim().min(1).max(1000) }));
  const items = await (await col.kb()).find({ active: true }).toArray();
  const a = answerQuestion(text, items.map(({ _id, ...k }) => ({ id: _id, ...k })));
  const item = a.kbId ? items.find((k) => k._id === a.kbId) : undefined;
  return {
    source: a.source,
    answer: a.fallback ? (await getSettings()).bot.fallback : a.text,
    entry: item ? { id: item._id, question: item.question } : null,
    score: a.score ?? null,
  };
});
