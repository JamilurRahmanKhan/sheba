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
});
