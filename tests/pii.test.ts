import { describe, expect, it } from "vitest";
import { maskPii } from "@/lib/pii";

describe("maskPii", () => {
  it("masks Bangladeshi mobile numbers in Latin, Bengali and +880 forms", () => {
    expect(maskPii("আমার নম্বর 01712345678")).toBe("আমার নম্বর [ফোন নম্বর]");
    expect(maskPii("+8801812345678 এ কল দিন")).toBe("[ফোন নম্বর] এ কল দিন");
    expect(maskPii("০১৭১২৩৪৫৬৭৮")).toBe("[ফোন নম্বর]");
  });
  it("masks 10/13/17-digit NID numbers", () => {
    expect(maskPii("NID 1234567890")).toBe("NID [NID নম্বর]");
    expect(maskPii("1990123456789 আমার এনআইডি")).toBe("[NID নম্বর] আমার এনআইডি");
    expect(maskPii("১২৩৪৫৬৭৮৯০১২৩৪৫৬৭")).not.toMatch(/[০-৯]{10}/);
  });
  it("masks e-mail addresses", () => expect(maskPii("mail me at a.b@x.gov.bd ok")).toBe("mail me at [ইমেইল] ok"));
  it("leaves ordinary text and short numbers alone", () => {
    expect(maskPii("ফি ৫০০ টাকা, ৩ সপ্তাহ, ২০২৬ সাল")).toBe("ফি ৫০০ টাকা, ৩ সপ্তাহ, ২০২৬ সাল");
    expect(maskPii("জন্ম নিবন্ধন সংশোধন")).toBe("জন্ম নিবন্ধন সংশোধন");
  });
});
