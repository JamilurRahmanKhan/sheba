import { z } from "zod";
import { query, rateLimit, clientIp, route } from "@/server/http";
import { pollConversation } from "@/server/chat";

const schema = z.object({ token: z.string().max(80), after: z.coerce.number().int().min(0).default(0) });

export const GET = route<{ id: string }>(async (req, { params }) => {
  rateLimit(`poll:${clientIp(req)}`, 120, 60_000);
  const { token, after } = query(req, schema);
  return pollConversation(params.id, token, after);
});
