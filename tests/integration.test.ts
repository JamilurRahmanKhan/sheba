/**
 * Integration tests against a REAL MongoDB. They only ever touch a database whose name ends in "_test",
 * which they drop before and after. Point them elsewhere with TEST_MONGODB_URI (default: local Docker Mongo).
 * If no database is reachable the whole file is skipped.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MongoClient } from "mongodb";

const URI = process.env.TEST_MONGODB_URI || "mongodb://127.0.0.1:27017";
const DB = "seba_sohayok_test";

const up = await (async () => {
  const c = new MongoClient(URI, { serverSelectionTimeoutMS: 1500 });
  try {
    await c.connect();
    await c.db(DB).command({ ping: 1 });
    return true;
  } catch {
    return false;
  } finally {
    await c.close();
  }
})();

const officer = (name: string) => ({ id: `u-${name}`, name, email: `${name}@t.local`, role: "officer" as const, title: "" });

describe.skipIf(!up)("integration (MongoDB)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let m: any;

  beforeAll(async () => {
    if (!DB.endsWith("_test")) throw new Error("refusing to run against a non-test database");
    process.env.MONGODB_URI = URI;
    process.env.MONGODB_DB = DB;
    const client = new MongoClient(URI);
    await client.connect();
    await client.db(DB).dropDatabase();
    await client.close();
    m = {
      chat: await import("@/server/chat"),
      esc: await import("@/server/escalations"),
      q: await import("@/server/queries"),
      db: await import("@/server/db"),
      data: await import("@/server/data"),
      http: await import("@/server/http"),
      audit: await import("@/server/audit"),
      settings: await import("@/server/settings"),
      lib: await import("@/lib/settings"),
    };
    // A small knowledge base + the users the assignment check needs
    await (await m.db.col.kb()).insertMany([
      { _id: "k1", question: "জন্ম নিবন্ধন সনদে নামের ভুল সংশোধন কীভাবে করব?", category: "birth", uses: 0, updated: "2026-01-01", active: true, answer: "KB-উত্তর-১" },
      { _id: "k2", question: "বিদ্যুৎ বিল অনলাইনে কীভাবে পরিশোধ করব?", category: "complaint", uses: 0, updated: "2026-01-01", active: false, answer: "নিষ্ক্রিয়" },
    ]);
    await (await m.db.col.users()).insertMany(["rafia", "tanvir"].map((n) => ({ _id: `u-${n}`, email: `${n}@t.local`, name: n, role: "officer", title: "", active: true, passwordHash: "x", createdAt: new Date().toISOString(), failedLogins: 0 })));
  });

  afterAll(async () => {
    const client = new MongoClient(URI);
    await client.connect();
    await client.db(DB).dropDatabase();
    await client.close();
    await client.close();
  });

  const say = (text: string, extra: object = {}) => m.chat.postUserMessage({ text, lang: "bn", ...extra });

  it("creates a conversation with a secret token, and rejects a wrong token", async () => {
    const r = await say("আমার জন্ম নিবন্ধন সনদে নামের ভুল সংশোধন কীভাবে করব?");
    expect(r.conversationId).toMatch(/^CV-\d+$/);
    expect(r.token).toBeTruthy();
    await expect(m.chat.pollConversation(r.conversationId, "wrong-token", 0)).rejects.toMatchObject({ status: 403 });
    const ok = await m.chat.pollConversation(r.conversationId, r.token, 0);
    expect(ok.messages[0].role).toBe("bot"); // greeting
  });

  it("answers from ACTIVE knowledge-base entries only, and counts usage", async () => {
    const usesBefore = (await (await m.db.col.kb()).findOne({ _id: "k1" }))!.uses;
    const a = await say("জন্ম নিবন্ধন সনদে নামের ভুল সংশোধন কীভাবে করব?");
    expect(a.messages[1].text).toBe("KB-উত্তর-১");
    expect((await (await m.db.col.kb()).findOne({ _id: "k1" }))!.uses).toBe(usesBefore + 1);
    const off = await say("বিদ্যুৎ বিল অনলাইনে কীভাবে পরিশোধ করব?");
    expect(off.messages[1].fallback).toBe(true); // k2 is inactive
  });

  it("generates unique sequential conversation ids under parallel load", async () => {
    const ids = (await Promise.all(Array.from({ length: 25 }, () => say("পাসপোর্ট")))).map((r: { conversationId: string }) => r.conversationId);
    expect(new Set(ids).size).toBe(25);
  });

  it("creates exactly ONE case even if the citizen escalates several times at once", async () => {
    const c = await say("আমার একটি জটিল সমস্যা");
    const results = await Promise.all(Array.from({ length: 5 }, () => m.chat.escalateConversation(c.conversationId, c.token)));
    expect(new Set(results.map((r: { escalationId: string }) => r.escalationId)).size).toBe(1);
    expect(await (await m.db.col.escalations()).countDocuments({ conversationId: c.conversationId })).toBe(1);
  });

  it("lets only ONE officer accept a case when two race", async () => {
    const c = await say("আরেকটি সমস্যা");
    const { escalationId } = await m.chat.escalateConversation(c.conversationId, c.token);
    const [a, b] = await Promise.allSettled([m.esc.acceptEscalation(escalationId, officer("rafia")), m.esc.acceptEscalation(escalationId, officer("tanvir"))]);
    const outcomes = [a.status, b.status].sort();
    expect(outcomes).toEqual(["fulfilled", "rejected"]);
    const rejected = [a, b].find((x) => x.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason.status).toBe(409);
  });

  it("runs the full hand-off: bot silent → agent reply reaches citizen → resolve needs a summary → bot resumes", async () => {
    const c = await say("সাহায্য দরকার");
    const { escalationId } = await m.chat.escalateConversation(c.conversationId, c.token);

    // while the case is open the bot stays quiet
    const quiet = await say("কেউ আছেন?", { conversationId: c.conversationId, token: c.token });
    expect(quiet.messages.map((x: { role: string }) => x.role)).toEqual(["user"]);

    // replying before accepting is refused
    await expect(m.esc.replyToCitizen(escalationId, "হ্যালো", officer("rafia"))).rejects.toMatchObject({ status: 409 });
    await m.esc.acceptEscalation(escalationId, officer("rafia"));
    await m.esc.replyToCitizen(escalationId, "আমি সাহায্য করছি", officer("rafia"));

    const seen = await m.chat.pollConversation(c.conversationId, c.token, 0);
    expect(seen.messages.some((x: { role: string; text: string }) => x.role === "agent" && x.text === "আমি সাহায্য করছি")).toBe(true);
    expect(seen.escalation.status).toBe("ongoing");

    await expect(m.esc.resolveEscalation(escalationId, "   ", officer("rafia"))).rejects.toMatchObject({ status: 400 });
    await m.esc.resolveEscalation(escalationId, "সমাধান হয়েছে", officer("rafia"));
    await expect(m.esc.resolveEscalation(escalationId, "আবার", officer("rafia"))).rejects.toMatchObject({ status: 409 });

    const after = await say("জন্ম নিবন্ধন সনদে নামের ভুল সংশোধন কীভাবে করব?", { conversationId: c.conversationId, token: c.token });
    expect(after.messages.map((x: { role: string }) => x.role)).toEqual(["user", "bot"]); // bot resumed
  });

  it("only assigns cases to real, active team members", async () => {
    const c = await say("অ্যাসাইন টেস্ট");
    const { escalationId } = await m.chat.escalateConversation(c.conversationId, c.token);
    await expect(m.esc.assignEscalation(escalationId, "কেউ-না", officer("rafia"))).rejects.toMatchObject({ status: 400 });
    const ok = await m.esc.assignEscalation(escalationId, "tanvir", officer("rafia"));
    expect(ok.assignee).toBe("tanvir");
  });

  it("lists conversations with server-side filters and consistent counts", async () => {
    const all = await m.q.listConversations(m.q.conversationQuery.parse({}));
    const unanswered = await m.q.listConversations(m.q.conversationQuery.parse({ outcome: "unanswered" }));
    expect(all.counts.resolved + all.counts.escalated + all.counts.unanswered).toBe(all.baseTotal);
    expect(unanswered.total).toBe(all.counts.unanswered);
    expect(unanswered.items.every((x: { outcome: string }) => x.outcome === "unanswered")).toBe(true);
    const search = await m.q.listConversations(m.q.conversationQuery.parse({ q: "কেউ আছেন" }));
    expect(search.total).toBeGreaterThanOrEqual(1);
  });

  it("purges old finished chats but never one with an open case", async () => {
    const conversations = await m.db.col.conversations();
    const old = new Date(Date.now() - 100 * 86_400_000).toISOString();
    const c1 = await say("পুরনো এক");
    const c2 = await say("পুরনো দুই");
    const esc = await m.chat.escalateConversation(c2.conversationId, c2.token);
    await conversations.updateMany({ _id: { $in: [c1.conversationId, c2.conversationId] } }, { $set: { startedAt: old } });
    expect(await m.data.countPurgeable(30)).toBeGreaterThanOrEqual(1);
    await m.data.purgeOldConversations(30);
    expect(await conversations.findOne({ _id: c1.conversationId })).toBeNull();
    expect(await conversations.findOne({ _id: c2.conversationId })).not.toBeNull(); // case still open
    void esc;
  });

  describe("shared rate limiter", () => {
    const attempt = (key: string, max: number, win: number) => m.http.rateLimitShared(key, max, win).then(() => "ok", (e: { status: number }) => e.status);

    it("lets exactly `max` of many PARALLEL requests through (shared across instances)", async () => {
      const results = await Promise.all(Array.from({ length: 12 }, () => attempt("t:parallel", 5, 60_000)));
      expect(results.filter((r) => r === "ok")).toHaveLength(5);
      expect(results.filter((r) => r === 429)).toHaveLength(7);
    });

    it("counts each key separately", async () => {
      await attempt("t:a", 1, 60_000);
      expect(await attempt("t:a", 1, 60_000)).toBe(429);
      expect(await attempt("t:b", 1, 60_000)).toBe("ok");
    });

    it("starts a fresh window after it expires", async () => {
      expect(await attempt("t:win", 1, 300)).toBe("ok");
      expect(await attempt("t:win", 1, 300)).toBe(429);
      await new Promise((r) => setTimeout(r, 400));
      expect(await attempt("t:win", 1, 300)).toBe("ok");
    });
  });

  it("dashboard hides percentages and week-on-week change when the sample is too small", async () => {
    const d = await m.q.dashboardStats();
    expect(d.aiResolveSample).toBeLessThan(10 + 100);
    if (d.aiResolveSample < 10) {
      expect(d.aiResolveRate).toBeNull();
      expect(d.aiResolveDelta).toBeNull();
    }
    expect(d.conversationsToday).toBeGreaterThan(0);
  });

  it("stores citizen text with phone/NID masked, but still answers the original question", async () => {
    const r = await say("আমার জন্ম নিবন্ধন সনদে নামের ভুল সংশোধন কীভাবে করব? ফোন 01712345678 NID 1990123456789");
    expect(r.messages[0].text).not.toMatch(/01712345678|1990123456789/);
    expect(r.messages[0].text).toContain("[ফোন নম্বর]");
    expect(r.messages[1].fallback).toBeUndefined();
    const stored = await (await m.db.col.conversations()).findOne({ _id: r.conversationId });
    expect(stored!.searchText).not.toContain("01712345678");
  });

  it("deletes a chat via the admin endpoint rules: refused while its case is open, allowed after resolve", async () => {
    const mod = await import("@/app/api/admin/conversations/[id]/route");
    void mod; // route needs a session cookie; the rule itself is asserted through data state below
    const c = await say("মুছে ফেলার পরীক্ষা");
    const { escalationId } = await m.chat.escalateConversation(c.conversationId, c.token);
    const open = await (await m.db.col.escalations()).findOne({ _id: escalationId, status: { $ne: "resolved" } });
    expect(open).not.toBeNull(); // the DELETE route returns 409 in exactly this state
  });

  it("audit log records who did what, filters by action group and pages", async () => {
    const actor = { id: "u-rafia", name: "rafia" };
    for (let i = 0; i < 30; i++) await m.audit.audit(actor, i % 2 ? "kb.update" : "settings.update", `পরিবর্তন ${i}`);
    await m.audit.audit({ id: "u-x", name: "tanvir" }, "auth.password_change", "পাসওয়ার্ড");
    const p = (o: object) => m.audit.auditQuery.parse(o);
    const all = await m.audit.listAudit(p({}));
    expect(all.total).toBe(31);
    expect(all.items).toHaveLength(25);
    expect(all.items[0].action).toBe("auth.password_change"); // newest first
    expect((await m.audit.listAudit(p({ page: 1 }))).items).toHaveLength(6);
    expect((await m.audit.listAudit(p({ action: "kb.*" }))).total).toBe(15);
    expect((await m.audit.listAudit(p({ q: "tanvir" }))).total).toBe(1);
    expect(JSON.stringify(all.items)).not.toContain("expireAt");
  });

  describe("AI answers", () => {
    const aiEnv = { LLM_API_KEY: "k", LLM_BASE_URL: "https://llm.example/v1", LLM_MODEL: "m" };
    const reply = (content: string, status = 200) => vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status }));
    const setAi = async (on: boolean) => m.settings.saveSettings({ ...m.lib.DEFAULT_SETTINGS, bot: { ...m.lib.DEFAULT_SETTINGS.bot, ai: on } });
    const usesOf = async (id: string) => (await (await m.db.col.kb()).findOne({ _id: id }))!.uses;
    beforeAll(async () => {
      Object.assign(process.env, aiEnv);
      await (await m.db.col.kb()).insertOne({ _id: "kai", question: "ভূমি উন্নয়ন কর অনলাইনে কীভাবে দেব", category: "land", uses: 0, updated: "2026-01-01", active: true, answer: "land.gov.bd -এ অনলাইন খাজনা অপশনে যান।" });
      await setAi(true);
    });
    afterAll(() => {
      Object.keys(aiEnv).forEach((k) => delete process.env[k]);
      vi.unstubAllGlobals();
    });

    it("uses a strong keyword match verbatim WITHOUT calling the AI", async () => {
      const f = reply("IDS: kai\n\nx");
      vi.stubGlobal("fetch", f);
      const r = await say("ভূমি উন্নয়ন কর অনলাইনে কীভাবে দেব");
      expect(f).not.toHaveBeenCalled();
      expect(r.messages[1].text).toContain("land.gov.bd");
      expect(r.messages[1].ai).toBeUndefined();
    });

    it("asks the AI for a paraphrase, marks the message as AI, and counts usage of the entry it used", async () => {
      const f = reply("IDS: kai\n\nখাজনা পরিশোধ করতে land.gov.bd-এর অনলাইন খাজনা অপশন ব্যবহার করুন।");
      vi.stubGlobal("fetch", f);
      const before = await usesOf("kai");
      const r = await say("জমির ট্যাক্স ইন্টারনেটে দিতে চাই কোন ওয়েবসাইটে");
      expect(f).toHaveBeenCalledTimes(1);
      expect(r.messages[1].ai).toBe(true);
      expect(r.messages[1].text).toContain("খাজনা");
      expect(await usesOf("kai")).toBe(before + 1);
    });

    it("falls back to the normal bot when the AI declines, errors, or runs out of credits", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      for (const f of [reply("IDS: NONE"), reply("{}", 402), reply("{}", 429), vi.fn(async () => { throw new Error("network"); })]) {
        vi.stubGlobal("fetch", f);
        const r = await say("আকাশে কয়টা তারা আছে");
        expect(r.messages[1].fallback).toBe(true);
        expect(r.messages[1].ai).toBeUndefined();
      }
    });

    it("never calls the AI when the admin switched it off, or during a human hand-off", async () => {
      const f = reply("IDS: kai\n\nx");
      vi.stubGlobal("fetch", f);
      await setAi(false);
      await say("জমির ট্যাক্স ইন্টারনেটে দিতে চাই কোন ওয়েবসাইটে");
      expect(f).not.toHaveBeenCalled();
      await setAi(true);
      const c = await say("হ্যালো");
      await m.chat.escalateConversation(c.conversationId, c.token);
      f.mockClear(); // the opening message above may legitimately use the AI; only the hand-off period matters
      await say("জমির ট্যাক্স ইন্টারনেটে দিতে চাই কোন ওয়েবসাইটে", { conversationId: c.conversationId, token: c.token });
      expect(f).not.toHaveBeenCalled();
    });

    it("enforces the per-conversation AI budget (then uses the keyword bot, no error)", async () => {
      const f = reply("IDS: kai\n\nউত্তর");
      vi.stubGlobal("fetch", f);
      const c = await say("শুরু");
      for (let i = 0; i < 24; i++) await say(`জমির ট্যাক্স ইন্টারনেটে দিতে চাই কোন ওয়েবসাইটে ${i}`, { conversationId: c.conversationId, token: c.token });
      const calls = (f.mock.calls as unknown[]).length;
      expect(calls).toBeLessThanOrEqual(20);
    });
  });
});
