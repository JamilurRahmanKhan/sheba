import "server-only";
import { answerQuestion, type BotAnswer } from "./bot";
import { askLlm, llmConfigured, selectContext } from "./llm";
import { rateLimitShared } from "./http";
import { FAQ_TOPICS, type Followup, type KbItem, type TopicId } from "@/lib/data";

export interface Composed extends BotAnswer {
  /** the answer was written by the language model from the knowledge base */
  ai?: boolean;
  /** knowledge-base entries whose usage counter should go up */
  usedKbIds: string[];
}

/** A deterministic KB match this strong is used verbatim: faster, free, and cannot hallucinate. */
const STRONG = 0.8;

/**
 * Best answer for a question:
 *  1. strong keyword match in the knowledge base -> that entry, verbatim
 *  2. otherwise, if AI is on and configured -> the model answers ONLY from retrieved KB entries (or declines)
 *  3. otherwise (or on any AI failure) -> topic answer / "I didn't understand"
 */
export async function composeAnswer(input: { text: string; kb: KbItem[]; history: { role: "user" | "assistant"; text: string }[]; aiEnabled: boolean; limitKey: string }): Promise<Composed> {
  const base = answerQuestion(input.text, input.kb);
  const strong = base.source === "kb" && (base.score ?? 0) >= STRONG;
  if (strong || !input.aiEnabled || !llmConfigured() || input.kb.length === 0) return { ...base, usedKbIds: base.kbId ? [base.kbId] : [] };

  try {
    await rateLimitShared("ai:global", Number(process.env.LLM_DAILY_LIMIT) || 3000, 86_400_000);
    await rateLimitShared(`ai:${input.limitKey}`, 20, 3_600_000);
  } catch {
    return { ...base, usedKbIds: base.kbId ? [base.kbId] : [] }; // budget spent: quietly use the keyword bot
  }

  const entries = selectContext(input.text, input.kb, base.topic);
  const res = await askLlm({ question: input.text, history: input.history, entries });
  if (!res) return { ...base, usedKbIds: base.kbId ? [base.kbId] : [] };

  const kbIds = res.ids.filter((id) => !id.startsWith("topic-"));
  const first = input.kb.find((k) => k.id === kbIds[0]);
  const topic: TopicId | null = first?.category ?? base.topic ?? (res.ids.find((i) => i.startsWith("topic-"))?.slice(6) as TopicId | undefined) ?? null;
  const followups: Followup[] = topic ? (FAQ_TOPICS.find((t) => t.id === topic)?.followups ?? []) : [];
  return { text: res.answer, topic, followups, kbId: kbIds[0], source: "ai", ai: true, usedKbIds: kbIds };
}
