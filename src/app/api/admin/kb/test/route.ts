import { z } from "zod";
import { body, rateLimitShared, route } from "@/server/http";
import { requireUser } from "@/server/auth";
import { col } from "@/server/db";
import { composeAnswer } from "@/server/answer";
import { getSettings } from "@/server/settings";

/** "Test the bot": what would it say to this question right now (including the AI, if enabled)? Nothing is stored or counted. */
export const POST = route(async (req) => {
  const me = await requireUser();
  const { text } = await body(req, z.object({ text: z.string().trim().min(1).max(1000) }));
  await rateLimitShared(`kbtest:${me.id}`, 30, 3_600_000);
  const [items, settings] = await Promise.all([(await col.kb()).find({ active: true }).toArray(), getSettings()]);
  const kb = items.map(({ _id, ...k }) => ({ id: _id, ...k }));
  const a = await composeAnswer({ text, kb, history: [], aiEnabled: settings.bot.ai !== false, limitKey: `test:${me.id}` });
  const item = a.kbId ? kb.find((k) => k.id === a.kbId) : undefined;
  return { source: a.source, answer: a.fallback ? settings.bot.fallback : a.text, entry: item ? { id: item.id, question: item.question } : null, score: a.score ?? null };
});
