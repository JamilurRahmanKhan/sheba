import { z } from "zod";
import { body, clientIp, rateLimit, route } from "@/server/http";
import { escalateConversation } from "@/server/chat";

export const POST = route<{ id: string }>(async (req, { params }) => {
  rateLimit(`escalate:${clientIp(req)}`, 10, 60_000);
  const { token } = await body(req, z.object({ token: z.string().max(80) }));
  return escalateConversation(params.id, token);
});
