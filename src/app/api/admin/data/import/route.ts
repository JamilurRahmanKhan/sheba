import { ApiError, route } from "@/server/http";
import { requireUser } from "@/server/auth";
import { importAll } from "@/server/data";

export const POST = route(async (req) => {
  await requireUser("admin");
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) throw new ApiError(415, "Content-Type অবশ্যই application/json হতে হবে।");
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError(400, "ফাইলটি পড়া যায়নি — এটি সঠিক JSON ব্যাকআপ নয়।");
  }
  const err = await importAll(raw);
  if (err) throw new ApiError(400, err);
  return { ok: true };
});
