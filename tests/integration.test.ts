/**
 * Integration tests against a REAL MongoDB. They only ever touch a database whose name ends in "_test",
 * which they drop before and after. Point them elsewhere with TEST_MONGODB_URI (default: local Docker Mongo).
 * If no database is reachable the whole file is skipped.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
});
