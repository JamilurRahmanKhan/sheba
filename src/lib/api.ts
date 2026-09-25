/** Browser-side API helper: JSON in/out, consistent errors, redirect to login when a session expires. */
export class ApiClientError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(url, {
    method: init?.method ?? (init?.body !== undefined ? "POST" : "GET"),
    headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    credentials: "same-origin",
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    if (res.status === 401 && url.startsWith("/api/admin") && typeof window !== "undefined") {
      // Full navigation on purpose: the server layout must re-check the (now invalid) session.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    }
    throw new ApiClientError(res.status, (data as { error?: string } | null)?.error ?? "অনুরোধ ব্যর্থ হয়েছে। আবার চেষ্টা করুন।");
  }
  return data as T;
}

export const fetcher = <T,>(url: string) => api<T>(url);

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : "কিছু একটা ভুল হয়েছে।");

/** Builds "?a=1&b=2" from an object, skipping defaults/empties. */
export function qs(params: Record<string, string | number | undefined>): string {
  const u = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== "") u.set(k, String(v));
  });
  const s = u.toString();
  return s ? `?${s}` : "";
}

/** Triggers a file download from an authenticated endpoint without leaving the page. */
export function download(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
