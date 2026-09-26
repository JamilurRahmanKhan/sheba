import { getFormatLang } from "./i18n";

/** English versions of the user-facing messages the server sends (Bengali). Unknown messages pass through unchanged. */
const ERROR_EN: Record<string, string> = {
  "ইমেইল বা পাসওয়ার্ড সঠিক নয়।": "Incorrect email or password.",
  "অনেকবার ভুল চেষ্টা হয়েছে। ১৫ মিনিট পরে আবার চেষ্টা করুন।": "Too many failed attempts. Try again in 15 minutes.",
  "অনেক বেশি অনুরোধ। একটু পরে আবার চেষ্টা করুন।": "Too many requests. Please try again shortly.",
  "সার্ভারে সমস্যা হয়েছে। একটু পরে আবার চেষ্টা করুন।": "Something went wrong on the server. Please try again shortly.",
  "অনুরোধ ব্যর্থ হয়েছে। আবার চেষ্টা করুন।": "The request failed. Please try again.",
  "ইনপুট সঠিক নয়।": "Invalid input.",
  "লগইন করুন।": "Please log in.",
  "এই কাজের অনুমতি আপনার নেই।": "You do not have permission to do this.",
  "এই কথোপকথনে প্রবেশের অনুমতি নেই।": "You do not have access to this conversation.",
  "কথোপকথন পাওয়া যায়নি।": "Conversation not found.",
  "কথোপকথনটি অনেক দীর্ঘ হয়ে গেছে। নতুন কথোপকথন শুরু করুন।": "This conversation has become too long. Please start a new one.",
  "প্রশ্ন লিখুন।": "Please type a question.",
  "প্রশ্ন সর্বোচ্চ ১০০০ অক্ষরের হতে পারে।": "A question can be at most 1000 characters.",
  "মানব প্রতিনিধির হস্তান্তর এখন বন্ধ আছে।": "Human hand-off is currently turned off.",
  "হস্তান্তর প্রক্রিয়াধীন আছে। একটু পরে আবার চেষ্টা করুন।": "A hand-off is in progress. Please try again shortly.",
  "এই কথোপকথনের হস্তান্তর এখনও খোলা আছে। আগে সেটি সমাধান করুন।": "This conversation's hand-off is still open. Resolve it first.",
  "এই হস্তান্তরটি ইতিমধ্যে অন্য কেউ গ্রহণ করেছেন।": "Someone else has already accepted this hand-off.",
  "হস্তান্তর পাওয়া যায়নি।": "Hand-off not found.",
  "উত্তর দিতে হস্তান্তরটি আগে গ্রহণ করুন (এবং সমাধান না হওয়া পর্যন্ত)।": "Accept the hand-off before replying (and only until it is resolved).",
  "এই হস্তান্তরের সাথে কোনো কথোপকথন সংযুক্ত নেই।": "No conversation is linked to this hand-off.",
  "শুধু সমাধান হওয়া হস্তান্তর পুনরায় খোলা যায়।": "Only resolved hand-offs can be reopened.",
  "সমাধানের সারসংক্ষেপ লিখুন।": "Please write a resolution summary.",
  "এন্ট্রি পাওয়া যায়নি।": "Entry not found.",
  "এই প্রশ্নটি নলেজ বেসে ইতিমধ্যে আছে।": "This question is already in the knowledge base.",
  "এই প্রশ্নটি নলেজ বেসে ইতিমধ্যে আছে। বিদ্যমান এন্ট্রি এডিট করুন বা বিকল্প প্রশ্ন যোগ করুন।": "This question is already in the knowledge base. Edit the existing entry or add an alternative phrasing.",
  "এই নাম বা ইমেইল দিয়ে আগে থেকেই একজন সদস্য আছেন।": "A member with this name or email already exists.",
  "এই নামে কোনো সক্রিয় সদস্য নেই।": "There is no active member with this name.",
  "সদস্য পাওয়া যায়নি।": "Member not found.",
  "কমপক্ষে একজন সক্রিয় অ্যাডমিন থাকতে হবে।": "There must be at least one active admin.",
  "নিজের অ্যাকাউন্ট নিষ্ক্রিয় করা বা নিজের অ্যাডমিন ভূমিকা সরানো যাবে না।": "You cannot deactivate your own account or remove your own admin role.",
  "নাম লিখুন।": "Please enter a name.",
  "সঠিক ইমেইল দিন।": "Please enter a valid email.",
  "বর্তমান পাসওয়ার্ড সঠিক নয়।": "The current password is incorrect.",
  "পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।": "The password must be at least 8 characters.",
  "পাসওয়ার্ড অতি দীর্ঘ।": "The password is too long.",
  "নিশ্চিতকরণ প্রয়োজন।": "Confirmation is required.",
  "এই সার্ভারে ডেমো ডেটায় রিসেট বন্ধ করা আছে (প্রোডাকশন সুরক্ষা)।": "Resetting to demo data is disabled on this server (production safeguard).",
  "ফাইলটি পড়া যায়নি — এটি সঠিক JSON ব্যাকআপ নয়।": "The file could not be read — it is not a valid JSON backup.",
  "JSON পড়া যায়নি।": "Could not read the JSON.",
  "Content-Type অবশ্যই application/json হতে হবে।": "Content-Type must be application/json.",
};

const localizeError = (msg: string) => (getFormatLang() === "en" ? (ERROR_EN[msg] ?? msg) : msg);

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
    throw new ApiClientError(res.status, localizeError((data as { error?: string } | null)?.error ?? "অনুরোধ ব্যর্থ হয়েছে। আবার চেষ্টা করুন।"));
  }
  return data as T;
}

export const fetcher = <T,>(url: string) => api<T>(url);

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : getFormatLang() === "en" ? "Something went wrong." : "কিছু একটা ভুল হয়েছে।");

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
