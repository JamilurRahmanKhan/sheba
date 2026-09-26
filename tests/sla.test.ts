import { describe, expect, it } from "vitest";
import { workingMinutesBetween } from "@/lib/settings";
import { DEFAULT_SETTINGS } from "@/lib/settings";

const H = DEFAULT_SETTINGS.hours; // Sun–Thu 09:00–17:00, Bangladesh time
const t = (iso: string) => new Date(iso).getTime(); // all instants below are UTC (BST = UTC+6)

describe("workingMinutesBetween", () => {
  it("counts only office hours within one day", () => {
    // Thu 2026-09-24 10:00–12:30 BST
    expect(workingMinutesBetween(t("2026-09-24T04:00:00Z"), t("2026-09-24T06:30:00Z"), H)).toBe(150);
  });
  it("counts nothing overnight or on the weekend", () => {
    expect(workingMinutesBetween(t("2026-09-24T14:00:00Z"), t("2026-09-25T02:00:00Z"), H)).toBe(0); // Thu 20:00 → Fri 08:00
    expect(workingMinutesBetween(t("2026-09-25T00:00:00Z"), t("2026-09-26T18:00:00Z"), H)).toBe(0); // all of Fri + Sat
  });
  it("skips Friday and Saturday but counts the next Sunday morning", () => {
    // Thu 16:00 BST → Sun 10:00 BST = 60 (Thu 16–17) + 60 (Sun 09–10)
    expect(workingMinutesBetween(t("2026-09-24T10:00:00Z"), t("2026-09-27T04:00:00Z"), H)).toBe(120);
  });
  it("counts a full working day as 8 hours", () => {
    expect(workingMinutesBetween(t("2026-09-23T00:00:00Z"), t("2026-09-23T23:00:00Z"), H)).toBe(480);
  });
  it("is plain elapsed time when working hours are disabled, and 0 for reversed ranges", () => {
    expect(workingMinutesBetween(t("2026-09-24T14:00:00Z"), t("2026-09-25T02:00:00Z"), { ...H, enabled: false })).toBe(720);
    expect(workingMinutesBetween(t("2026-09-25T02:00:00Z"), t("2026-09-24T14:00:00Z"), H)).toBe(0);
  });
});
