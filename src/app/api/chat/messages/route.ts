import { z } from "zod";
import { body, clientIp, rateLimitShared, route } from "@/server/http";
import { postUserMessage } from "@/server/chat";

/** The AI step may retry once; give the function room on Vercel. */
export const maxDuration = 30;

const schema = z.object({
  conversationId: z.string().max(40).optional(),
  token: z.string().max(80).optional(),
  text: z.string().trim().min(1, "প্রশ্ন লিখুন।").max(1000, "প্রশ্ন সর্বোচ্চ ১০০০ অক্ষরের হতে পারে।"),
  lang: z.enum(["bn", "en"]).default("bn"),
  followup: z.object({ topicId: z.enum(["birth", "nid", "passport", "trade", "land", "allowance", "tax", "complaint"]), label: z.string().max(100) }).optional(),
});

export const POST = route(async (req) => {
  await rateLimitShared(`chat:${clientIp(req)}`, 40, 60_000);
  const input = await body(req, schema);
  return postUserMessage(input);
});
