import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";

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

/* ---------------- tiny in-memory rate limiter (per server instance; a speed bump, not a wall) ---------------- */

const buckets = new Map<string, { n: number; reset: number }>();

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

export const clientIp = (req: NextRequest) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
