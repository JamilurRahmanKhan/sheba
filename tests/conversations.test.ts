import { describe, expect, it } from "vitest";
import { buildSeedConversations, deriveOutcome, retainConversations, toCsv, type Conversation } from "@/lib/conversations";
import { SEED_ESCALATIONS, type Escalation } from "@/lib/data";
import { normalizeEscalation } from "@/lib/escalations";

const NOW = new Date("2026-09-25T12:00:00Z").getTime();
const conv = (over: Partial<Conversation>): Conversation => ({ id: "CV-1", startedAt: new Date(NOW).toISOString(), lang: "bn", topic: null, messages: [], escalated: false, reviewed: false, flagged: false, note: "", ...over });

describe("deriveOutcome", () => {
  it("escalated wins, then unanswered, else resolved", () => {
    const fb = { role: "bot" as const, text: "x", at: "", fallback: true };
    expect(deriveOutcome(conv({ escalated: true, messages: [fb] }))).toBe("escalated");
    expect(deriveOutcome(conv({ messages: [fb] }))).toBe("unanswered");
    expect(deriveOutcome(conv({ messages: [{ role: "bot", text: "ok", at: "" }] }))).toBe("resolved");
  });
});

describe("seed data", () => {
  const seeds = buildSeedConversations(NOW);
  it("builds unique, ascending ids and 6 escalated chats matching the seeded cases", () => {
    expect(new Set(seeds.map((c) => c.id)).size).toBe(seeds.length);
    expect(seeds.filter((c) => c.escalated).map((c) => c.escalationId).sort()).toEqual(SEED_ESCALATIONS.map((e) => e.id).sort());
  });
  it("normalises legacy escalations with coherent timestamps", () => {
    const e = normalizeEscalation(SEED_ESCALATIONS[3], seeds, NOW);
    expect(e.status).toBe("ongoing");
    expect(e.priority).toBe("urgent");
    expect(new Date(e.acceptedAt!).getTime()).toBeGreaterThanOrEqual(new Date(e.createdAt).getTime());
    expect(e.assignee).toBeTruthy();
  });
});

describe("retainConversations", () => {
  const day = 86_400_000;
  const old = (id: string, over: Partial<Conversation> = {}) => conv({ id, startedAt: new Date(NOW - 40 * day).toISOString(), ...over });
  const esc = (id: string, status: Escalation["status"]) => ({ id, status }) as Escalation;

  it("keeps everything when retention is 0", () => expect(retainConversations([old("a")], [], 0, NOW)).toHaveLength(1));
  it("deletes old finished chats but keeps recent ones", () => {
    const kept = retainConversations([old("a"), conv({ id: "b" })], [], 30, NOW);
    expect(kept.map((c) => c.id)).toEqual(["b"]);
  });
  it("never deletes an old chat whose case is still open", () => {
    const list = [old("open", { escalationId: "E1" }), old("done", { escalationId: "E2" })];
    const kept = retainConversations(list, [esc("E1", "ongoing"), esc("E2", "resolved")], 30, NOW);
    expect(kept.map((c) => c.id)).toEqual(["open"]);
  });
});

describe("toCsv", () => {
  it("starts with a BOM, escapes quotes and keeps Bengali intact", () => {
    const csv = toCsv([conv({ messages: [{ role: "user", text: 'বলল "হ্যালো"', at: NOW.toString() }], note: 'a,b"c' })]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"বলল ""হ্যালো"""');
    expect(csv).toContain('"a,b""c"');
  });
});
