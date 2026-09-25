import { z } from "zod";

export const kbSchema = z.object({
  question: z.string().trim().min(3, "প্রশ্ন লিখুন।").max(300),
  category: z.enum(["birth", "nid", "passport", "trade", "land", "allowance", "tax", "complaint"]),
  answer: z.string().trim().min(2, "উত্তর লিখুন।").max(4000),
});
