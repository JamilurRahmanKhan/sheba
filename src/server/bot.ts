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
  /** where the answer came from */
  source: "kb" | "topic" | "fallback" | "ai";
  score?: number;
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
  // the question and every alternative phrasing are candidates; the best one counts
  let best = { score: 0, matched: 0 };
  for (const phrase of [item.question, ...(item.aliases ?? [])]) {
    const itemTokens = tokenize(phrase);
    if (itemTokens.length === 0) continue;
    const matched = itemTokens.filter((t) => queryTokens.some((q) => sameToken(q, t))).length;
    const enough = matched >= 2 || (itemTokens.length <= 2 && matched >= 1);
    const score = enough ? matched / itemTokens.length : 0;
    if (score > best.score) best = { score, matched };
  }
  return best;
}

/** What the citizen is asking *about* a service (Bengali, English and romanised Bengali wording). */
const INTENTS = {
  fee: { words: /ফি|খরচ|টাকা|মূল্য|\b(fee|fees|cost|price|charge|taka|tk|koto taka|fi)\b/i, label: /ফি/ },
  time: { words: /কতদিন|কত দিন|কয়দিন|কতক্ষণ|মেয়াদ|\b(how long|days|duration|validity|koto din|kotodin|kotodin lage)\b/i, label: /কতদিন|মেয়াদ|সময়/ },
  docs: { words: /কাগজ|ডকুমেন্ট|প্রয়োজনীয়|\b(documents?|papers?|required|requirements?|kagoj|kagojpotro)\b/i, label: /কাগজ/ },
} as const;

function detectIntent(text: string): keyof typeof INTENTS | null {
  for (const k of Object.keys(INTENTS) as (keyof typeof INTENTS)[]) if (INTENTS[k].words.test(text)) return k;
  return null;
}

/**
 * Answer a question from the *active* knowledge base.
 * 1) keyword → topic; within that topic prefer the best-matching KB entry, else the topic's standard answer.
 * 2) no topic → best KB entry across all topics (so admin-added entries on new subjects work).
 */
export function answerQuestion(text: string, activeKb: KbItem[], contextTopic: TopicId | null = null): BotAnswer {
  const q = tokenize(text);
  const intent = detectIntent(text);
  // "fee koto?" with no subject: assume the topic the citizen was just talking about
  const topic = matchTopic(text) ?? (intent && contextTopic ? (FAQ_TOPICS.find((t) => t.id === contextTopic) ?? null) : null);
  const followupsOf = (id: TopicId | null) => (id ? (FAQ_TOPICS.find((t) => t.id === id)?.followups ?? []) : []);

  const pool = topic ? activeKb.filter((k) => k.category === topic.id) : activeKb;
  let best: { item: KbItem; score: number } | null = null;
  for (const item of pool) {
    const { score } = scoreItem(q, item);
    if (score > 0 && (!best || score > best.score)) best = { item, score };
  }

  if (topic) {
    if (best && best.score >= 0.5) return { text: best.item.answer, topic: topic.id, followups: followupsOf(topic.id), kbId: best.item.id, source: "kb", score: best.score };
    const fu = intent ? topic.followups.find((f) => INTENTS[intent].label.test(f.label)) : undefined;
    if (fu) return { text: fu.answer, topic: topic.id, followups: topic.followups, source: "topic" };
    return { text: topic.answer, topic: topic.id, followups: topic.followups, source: "topic" };
  }
  if (best && best.score >= 0.5) return { text: best.item.answer, topic: best.item.category, followups: followupsOf(best.item.category), kbId: best.item.id, source: "kb", score: best.score };
  return { text: "", topic: null, followups: [], fallback: true, source: "fallback" };
}

export function followupAnswer(topicId: TopicId, label: string): string | null {
  return FAQ_TOPICS.find((t) => t.id === topicId)?.followups.find((f) => f.label === label)?.answer ?? null;
}
