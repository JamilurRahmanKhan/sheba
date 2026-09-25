import { z } from "zod";
import { body, route } from "@/server/http";
import { rateConversation } from "@/server/chat";

export const POST = route<{ id: string }>(async (req, { params }) => {
  const { token, rating } = await body(req, z.object({ token: z.string().max(80), rating: z.number().int().min(1).max(5) }));
  await rateConversation(params.id, token, rating);
  return { ok: true };
});
