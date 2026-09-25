import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { col } from "./db";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (m: string) => new ApiError(400, m);
export const unauthorized = (m = "লগইন করুন।") => new ApiError(401, m);
export const forbidden = (m = "এই কাজের অনুমতি আপনার নেই।") => new ApiError(403, m);
export const notFound = (m = "পাওয়া যায়নি।") => new ApiError(404, m);
export const conflict = (m: string) => new ApiError(409, m);

type Ctx<P> = { params: Promise<P> };

/** Wraps a route handler: consistent JSON errors, validation errors → 400, no stack traces leaked. */
export function route<P = Record<string, never>>(fn: (req: NextRequest, ctx: { params: P }) => Promise<Response | object>) {
  return async (req: NextRequest, ctx: Ctx<P>): Promise<Response> => {
    try {
      const out = await fn(req, { params: await ctx.params });
      return out instanceof Response ? out : NextResponse.json(out);
    } catch (err) {
      if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
      if (err instanceof ZodError) {
        const first = err.issues[0];
        return NextResponse.json({ error: first ? `${first.path.join(".") || "ইনপুট"}: ${first.message}` : "ইনপুট সঠিক নয়।" }, { status: 400 });
      }
      console.error("[api]", req.method, req.nextUrl.pathname, err);
      return NextResponse.json({ error: "সার্ভারে সমস্যা হয়েছে। একটু পরে আবার চেষ্টা করুন।" }, { status: 500 });
    }
  };
}

/** Parses a JSON body. Requiring application/json also blocks cross-site HTML form posts (CSRF). */
export async function body<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  const type = req.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) throw new ApiError(415, "Content-Type অবশ্যই application/json হতে হবে।");
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw badRequest("JSON পড়া যায়নি।");
  }
  return schema.parse(raw);
}

export function query<T>(req: NextRequest, schema: ZodType<T>): T {
  return schema.parse(Object.fromEntries(req.nextUrl.searchParams));
}

/* ---------------- rate limiting ---------------- */

const buckets = new Map<string, { n: number; reset: number }>();

/** Cheap per-instance limiter for high-frequency, low-risk calls (e.g. chat polling). */
export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { n: 1, reset: now + windowMs });
    if (buckets.size > 5000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
    return;
  }
  b.n += 1;
  if (b.n > max) throw new ApiError(429, "অনেক বেশি অনুরোধ। একটু পরে আবার চেষ্টা করুন।");
}

/**
 * Shared limiter backed by MongoDB, so the limit holds across all serverless instances.
 * One atomic upsert per call; documents expire automatically (TTL index on `expireAt`).
 * Fails open: if the database call itself fails we let the request through (and log) rather than take the site down.
 */
export async function rateLimitShared(key: string, max: number, windowMs: number): Promise<void> {
  let n = 0;
  try {
    const limits = await col.rateLimits();
    const now = new Date();
    const expireAt = new Date(now.getTime() + windowMs);
    const doc = await limits.findOneAndUpdate(
      { _id: key },
      [
        {
          $set: {
            // a missing/expired window starts a new one
            n: { $cond: [{ $lt: [{ $ifNull: ["$expireAt", new Date(0)] }, now] }, 1, { $add: [{ $ifNull: ["$n", 0] }, 1] }] },
            expireAt: { $cond: [{ $lt: [{ $ifNull: ["$expireAt", new Date(0)] }, now] }, expireAt, "$expireAt"] },
          },
        },
      ],
      { upsert: true, returnDocument: "after" },
    );
    n = doc?.n ?? 0;
  } catch (err) {
    console.error("[rate-limit] shared limiter unavailable, failing open:", err instanceof Error ? err.message : err);
    return;
  }
  if (n > max) throw new ApiError(429, "অনেক বেশি অনুরোধ। একটু পরে আবার চেষ্টা করুন।");
}

export const clientIp = (req: NextRequest) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
