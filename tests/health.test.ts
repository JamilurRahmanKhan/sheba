import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { configProblems } from "@/server/health";

const KEYS = ["SESSION_SECRET", "CRON_SECRET", "ADMIN_EMAIL", "ADMIN_PASSWORD"] as const;
let saved: Record<string, string | undefined>;
beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  Object.assign(process.env, { SESSION_SECRET: "x".repeat(40), CRON_SECRET: "c", ADMIN_EMAIL: "a@b.co", ADMIN_PASSWORD: "long-enough-pass" });
});
afterEach(() => KEYS.forEach((k) => (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]))));

describe("configProblems", () => {
  it("reports nothing for a healthy configuration", () => expect(configProblems(false)).toEqual([]));
  it("flags a weak admin password only while no admin exists", () => {
    process.env.ADMIN_PASSWORD = "short";
    expect(configProblems(false).join(" ")).toMatch(/ADMIN_PASSWORD is not accepted/);
    expect(configProblems(true)).toEqual([]);
  });
  it("flags a padded password, bad email and a short session secret", () => {
    process.env.ADMIN_PASSWORD = " padded-password ";
    process.env.ADMIN_EMAIL = "not-an-email";
    process.env.SESSION_SECRET = "short";
    const text = configProblems(false).join(" | ");
    expect(text).toMatch(/spaces/);
    expect(text).toMatch(/ADMIN_EMAIL/);
    expect(text).toMatch(/SESSION_SECRET is too short/);
  });
  it("never includes secret values in its messages", () => {
    process.env.ADMIN_PASSWORD = "my-super-secret-pw ";
    expect(configProblems(false).join(" ")).not.toContain("my-super-secret-pw");
  });
});
