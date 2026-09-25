import { z } from "zod";
import { ApiError, body, route } from "@/server/http";
import { requireUser } from "@/server/auth";
import { resetToDemo } from "@/server/data";

export const POST = route(async (req) => {
  await requireUser("admin");
  const { confirm } = await body(req, z.object({ confirm: z.literal("RESET") }));
  if (confirm !== "RESET") throw new ApiError(400, "নিশ্চিতকরণ প্রয়োজন।");
  await resetToDemo();
  return { ok: true };
});
