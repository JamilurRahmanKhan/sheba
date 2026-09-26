import { describe, expect, it } from "vitest";
import { answerQuestion, scoreItem, tokenize } from "@/server/bot";
import { FAQ_TOPICS, SEED_KB, type KbItem } from "@/lib/data";

const kb = (over: Partial<KbItem>[] = []): KbItem[] => [...SEED_KB.filter((k) => k.active), ...over.map((o, i) => ({ id: `x${i}`, question: "", category: "birth" as const, uses: 0, updated: "2026-01-01", active: true, answer: "", ...o }))];

describe("tokenize", () => {
  it("drops stop-words and short tokens, keeps Bengali words", () => {
    expect(tokenize("আমার জন্ম নিবন্ধন কীভাবে করব?")).toEqual(["জন্ম", "নিবন্ধন"]);
  });
  it("handles English", () => {
    expect(tokenize("How to renew my passport")).toEqual(["renew", "passport"]);
  });
});

describe("answerQuestion", () => {
  it("answers a topic keyword from the matching KB entry when one fits", () => {
    const a = answerQuestion("আমার জন্ম নিবন্ধন সনদে নামের বানান ভুল আছে, কীভাবে সংশোধন করব?", kb());
    expect(a.fallback).toBeUndefined();
    expect(a.topic).toBe("birth");
    expect(a.kbId).toBe("q1");
  });

  it("reflects an admin edit of the KB answer", () => {
    const edited = kb().map((k) => (k.id === "q1" ? { ...k, answer: "সম্পাদিত উত্তর" } : k));
    expect(answerQuestion("আমার জন্ম নিবন্ধন সনদে নামের বানান ভুল আছে, কীভাবে সংশোধন করব?", edited).text).toBe("সম্পাদিত উত্তর");
  });

  it("falls back to the standard topic answer when the matching entry is not in the active pool", () => {
    const without = kb().filter((k) => k.id !== "q1");
    const a = answerQuestion("আমার জন্ম নিবন্ধন সনদে নামের বানান ভুল আছে, কীভাবে সংশোধন করব?", without);
    expect(a.kbId).toBeUndefined();
    expect(a.text).toBe(FAQ_TOPICS[0].answer);
    expect(a.followups.length).toBeGreaterThan(0);
  });

  it("answers an admin-added entry on a brand-new subject (no topic keyword)", () => {
    const pool = kb([{ id: "bill", question: "বিদ্যুৎ বিল অনলাইনে কীভাবে পরিশোধ করব?", category: "complaint", answer: "অ্যাপ ব্যবহার করুন" }]);
    expect(answerQuestion("বিদ্যুৎ বিল অনলাইনে কীভাবে পরিশোধ করব?", pool).kbId).toBe("bill");
    expect(answerQuestion("আমি বিদ্যুৎ বিল কোথায় দেব?", pool).kbId).toBe("bill"); // paraphrase
  });

  it("falls back for unrelated questions and never invents an answer", () => {
    const pool = kb([{ id: "bill", question: "বিদ্যুৎ বিল অনলাইনে কীভাবে পরিশোধ করব?", answer: "x" }]);
    expect(answerQuestion("আজকের আবহাওয়া কেমন?", pool).fallback).toBe(true);
    expect(answerQuestion("ভিসা আবেদন কীভাবে করব?", pool).fallback).toBe(true);
  });

  it("understands common English keywords", () => {
    expect(answerQuestion("passport fee", kb()).topic).toBe("passport");
  });

  it("tolerates Bengali suffixes (সনদ ~ সনদে ~ সনদের)", () => {
    const item = SEED_KB[0];
    expect(scoreItem(tokenize("জন্ম নিবন্ধনের সনদের নামের ভুল সংশোধন"), item).score).toBeGreaterThanOrEqual(0.5);
  });

  it("matches on alternative phrasings (aliases), and reports where the answer came from", () => {
    const item = { id: "bill", question: "বিদ্যুৎ বিল অনলাইনে কীভাবে পরিশোধ করব?", category: "complaint" as const, uses: 0, updated: "", active: true, answer: "অ্যাপ", aliases: ["মিটারের টাকা কোথায় জমা দেব", "প্রিপেইড মিটার রিচার্জ"] };
    const withAlias = answerQuestion("প্রিপেইড মিটার রিচার্জ করব কীভাবে", [item]);
    expect(withAlias.kbId).toBe("bill");
    expect(withAlias.source).toBe("kb");
    expect(answerQuestion("প্রিপেইড মিটার রিচার্জ করব কীভাবে", [{ ...item, aliases: [] }]).fallback).toBe(true);
    expect(answerQuestion("আজকের আবহাওয়া", [item]).source).toBe("fallback");
    expect(answerQuestion("পাসপোর্টের ফি", []).source).toBe("topic");
  });
});

describe("intent handling", () => {
  it("answers 'passport fee' style questions with the fee answer, incl. romanised Bengali", () => {
    const a = answerQuestion("passport banate koto taka lagbe", []);
    expect(a.topic).toBe("passport");
    expect(a.text).toContain("ফি");
  });
  it("uses the previous topic for a subject-less follow-up like 'fee koto'", () => {
    const a = answerQuestion("fee koto", [], "nid");
    expect(a.topic).toBe("nid");
    expect(a.fallback).toBeFalsy();
  });
  it("still falls back when there is no topic and no context", () => {
    expect(answerQuestion("fee koto", []).fallback).toBe(true);
  });
});
