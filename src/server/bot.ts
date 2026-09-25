import "server-only";
import { FAQ_TOPICS, matchTopic, type Followup, type KbItem, type TopicId } from "@/lib/data";

export interface BotAnswer {
  text: string;
  topic: TopicId | null;
  followups: Followup[];
  /** knowledge-base entry that produced the answer (its usage counter is incremented) */
  kbId?: string;
  /** the bot could not answer */
  fallback?: boolean;
}

const STOP = new Set([
  "কী", "কি", "কীভাবে", "কিভাবে", "কোথায়", "কত", "করব", "করতে", "করা", "করে", "আমার", "আমি", "হবে", "হয়", "হয়েছে", "জন্য", "থেকে", "এর", "একটি", "কেন", "না", "নিয়ম", "প্রক্রিয়া", "আছে", "চাই", "পাব", "যাবে", "দিয়ে", "সময়",
  "the", "a", "an", "is", "are", "how", "to", "do", "i", "my", "can", "what", "where", "for", "of", "and", "in", "on", "me",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFC")
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter((t) => t.length >= 2 && !STOP.has(t));
}

/** Loose match that tolerates Bengali suffixes (সনদ ~ সনদে ~ সনদের). */
function sameToken(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 3 && long.startsWith(short);
}

/** Share of the entry's own keywords found in the question (0–1), and how many matched. */
export function scoreItem(queryTokens: string[], item: KbItem): { score: number; matched: number } {
  const itemTokens = tokenize(item.question);
  if (itemTokens.length === 0) return { score: 0, matched: 0 };
  const matched = itemTokens.filter((t) => queryTokens.some((q) => sameToken(q, t))).length;
  const enough = matched >= 2 || (itemTokens.length <= 2 && matched >= 1);
  return { score: enough ? matched / itemTokens.length : 0, matched };
}

/**
 * Answer a question from the *active* knowledge base.
 * 1) keyword → topic; within that topic prefer the best-matching KB entry, else the topic's standard answer.
 * 2) no topic → best KB entry across all topics (so admin-added entries on new subjects work).
 */
export function answerQuestion(text: string, activeKb: KbItem[]): BotAnswer {
  const q = tokenize(text);
  const topic = matchTopic(text);
  const followupsOf = (id: TopicId | null) => (id ? (FAQ_TOPICS.find((t) => t.id === id)?.followups ?? []) : []);

  const pool = topic ? activeKb.filter((k) => k.category === topic.id) : activeKb;
  let best: { item: KbItem; score: number } | null = null;
  for (const item of pool) {
    const { score } = scoreItem(q, item);
    if (score > 0 && (!best || score > best.score)) best = { item, score };
  }

  if (topic) {
    if (best && best.score >= 0.5) return { text: best.item.answer, topic: topic.id, followups: followupsOf(topic.id), kbId: best.item.id };
    return { text: topic.answer, topic: topic.id, followups: topic.followups };
  }
  if (best && best.score >= 0.5) return { text: best.item.answer, topic: best.item.category, followups: followupsOf(best.item.category), kbId: best.item.id };
  return { text: "", topic: null, followups: [], fallback: true };
}

export function followupAnswer(topicId: TopicId, label: string): string | null {
  return FAQ_TOPICS.find((t) => t.id === topicId)?.followups.find((f) => f.label === label)?.answer ?? null;
}
