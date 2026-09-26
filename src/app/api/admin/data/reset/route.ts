import { z } from "zod";
import { ApiError, body, route } from "@/server/http";
import { requireUser } from "@/server/auth";
import { audit } from "@/server/audit";
import { resetAllowed, resetToDemo } from "@/server/data";

export const POST = route(async (req) => {
  const me = await requireUser("admin");
  if (!resetAllowed()) throw new ApiError(403, "এই সার্ভারে ডেমো ডেটায় রিসেট বন্ধ করা আছে (প্রোডাকশন সুরক্ষা)।");
  const { confirm } = await body(req, z.object({ confirm: z.literal("RESET") }));
  if (confirm !== "RESET") throw new ApiError(400, "নিশ্চিতকরণ প্রয়োজন।");
  await resetToDemo();
  await audit(me, "data.reset", "সব ডেটা মুছে ডেমো ডেটা লোড করা হয়েছে");
  return { ok: true };
});
