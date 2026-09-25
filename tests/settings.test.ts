import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, mergeSettings, validateSettings, withinWorkingHours } from "@/lib/settings";

const s = (over: object = {}) => ({ ...DEFAULT_SETTINGS, ...over });

describe("validateSettings", () => {
  it("accepts the defaults", () => expect(validateSettings(DEFAULT_SETTINGS)).toEqual({}));
  it("rejects a bad SLA", () => {
    expect(validateSettings(s({ slaMinutes: 0 })).slaMinutes).toBeTruthy();
    expect(validateSettings(s({ slaMinutes: 241 })).slaMinutes).toBeTruthy();
    expect(validateSettings(s({ slaMinutes: 1.5 })).slaMinutes).toBeTruthy();
    expect(validateSettings(s({ slaMinutes: NaN })).slaMinutes).toBeTruthy();
  });
  it("rejects end time before start, and no working days", () => {
    expect(validateSettings(s({ hours: { ...DEFAULT_SETTINGS.hours, start: "17:00", end: "09:00" } })).hours).toBeTruthy();
    expect(validateSettings(s({ hours: { ...DEFAULT_SETTINGS.hours, days: [] } })).hours).toBeTruthy();
  });
  it("retention must be 0 or 7..3650", () => {
    expect(validateSettings(s({ retentionDays: 0 })).retentionDays).toBeUndefined();
    expect(validateSettings(s({ retentionDays: 30 })).retentionDays).toBeUndefined();
    expect(validateSettings(s({ retentionDays: 3 })).retentionDays).toBeTruthy();
  });
  it("requires non-empty bot messages", () => {
    expect(validateSettings(s({ bot: { ...DEFAULT_SETTINGS.bot, greeting: "  " } })).greeting).toBeTruthy();
  });
});

describe("mergeSettings", () => {
  it("fills gaps from defaults and ignores junk", () => {
    expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings({ slaMinutes: 30 }).slaMinutes).toBe(30);
    expect(mergeSettings({ slaMinutes: "x" }).slaMinutes).toBe(DEFAULT_SETTINGS.slaMinutes);
  });
});

describe("withinWorkingHours (Asia/Dhaka)", () => {
  // Default: Sun–Thu 09:00–17:00 (Bangladesh time, UTC+6)
  it("open on a Thursday at noon", () => expect(withinWorkingHours(DEFAULT_SETTINGS.hours, new Date("2026-09-24T06:00:00Z"))).toBe(true)); // 12:00 BST
  it("closed on Friday", () => expect(withinWorkingHours(DEFAULT_SETTINGS.hours, new Date("2026-09-25T06:00:00Z"))).toBe(false));
  it("closed before opening and at closing time", () => {
    expect(withinWorkingHours(DEFAULT_SETTINGS.hours, new Date("2026-09-24T02:59:00Z"))).toBe(false); // 08:59 BST
    expect(withinWorkingHours(DEFAULT_SETTINGS.hours, new Date("2026-09-24T11:00:00Z"))).toBe(false); // 17:00 BST
  });
  it("always open when hours are disabled", () => expect(withinWorkingHours({ ...DEFAULT_SETTINGS.hours, enabled: false }, new Date("2026-09-25T06:00:00Z"))).toBe(true));
});
