import { ApiError, route } from "@/server/http";
import { requireUser } from "@/server/auth";
import { audit } from "@/server/audit";
import { importAll } from "@/server/data";

export const POST = route(async (req) => {
  const me = await requireUser("admin");
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) throw new ApiError(415, "Content-Type অবশ্যই application/json হতে হবে।");
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError(400, "ফাইলটি পড়া যায়নি — এটি সঠিক JSON ব্যাকআপ নয়।");
  }
  const err = await importAll(raw);
  if (err) throw new ApiError(400, err);
  await audit(me, "data.import", "ব্যাকআপ থেকে পুনরুদ্ধার (সব ডেটা প্রতিস্থাপিত)");
  return { ok: true };
});
