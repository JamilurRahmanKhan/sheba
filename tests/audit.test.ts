import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetAllowed } from "@/server/data";

const saved = { node: process.env.NODE_ENV, flag: process.env.ALLOW_DEMO_RESET };
beforeEach(() => void 0);
afterEach(() => {
  (process.env as Record<string, string | undefined>).NODE_ENV = saved.node;
  if (saved.flag === undefined) delete process.env.ALLOW_DEMO_RESET;
  else process.env.ALLOW_DEMO_RESET = saved.flag;
});

describe("resetAllowed (production safety)", () => {
  it("is allowed in development and test", () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    expect(resetAllowed()).toBe(true);
  });
  it("is blocked in production unless explicitly enabled", () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    delete process.env.ALLOW_DEMO_RESET;
    expect(resetAllowed()).toBe(false);
    process.env.ALLOW_DEMO_RESET = "yes";
    expect(resetAllowed()).toBe(false);
    process.env.ALLOW_DEMO_RESET = "true";
    expect(resetAllowed()).toBe(true);
  });
});
