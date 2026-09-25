import { z } from "zod";
import { body, clientIp, rateLimitShared, route } from "@/server/http";
import { escalateConversation } from "@/server/chat";

export const POST = route<{ id: string }>(async (req, { params }) => {
  await rateLimitShared(`escalate:${clientIp(req)}`, 10, 60_000);
  const { token } = await body(req, z.object({ token: z.string().max(80) }));
  return escalateConversation(params.id, token);
});
