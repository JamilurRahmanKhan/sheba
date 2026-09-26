import { FALLBACK, GREETING } from "./data";
import { getFormatLang, tr } from "./i18n";

export type Role = "admin" | "officer";

/** The signed-in user as the browser sees it. */
export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  title: string;
}

/** Public shape of a user account (never includes the password hash). */
export interface TeamMember {
  id: string;
  email: string;
  /** Immutable: stored on cases/notes as the officer's identity. */
  name: string;
  role: Role;
  /** job title shown in the team list */
  title: string;
  active: boolean;
}

export interface ReplyTemplate {
  id: string;
  title: string;
  text: string;
}

export interface Settings {
  org: { panelTitle: string; departmentName: string };
  /** minutes a new hand-off may wait before it counts as overdue */
  slaMinutes: number;
  hours: {
    enabled: boolean;
    /** 0 = Sunday … 6 = Saturday (Asia/Dhaka) */
    days: number[];
    start: string; // "HH:MM"
    end: string;
  };
  handoff: { enabled: boolean; offHoursMessage: string };
  bot: { greeting: string; fallback: string; maintenance: boolean; maintenanceMessage: string; /** let the AI model compose answers from the knowledge base */ ai: boolean };
  /** delete finished conversations older than this many days; 0 = keep forever */
  retentionDays: number;
  /** saved replies officers can insert into a hand-off reply */
  replyTemplates: ReplyTemplate[];
}

/** Demo officers created by the seed script (names are referenced by the demo hand-offs). */
export const DEMO_OFFICERS = [
  { name: "রাফিয়া সুলতানা", title: "সিনিয়র সাপোর্ট অফিসার", email: "rafia@demo.local" },
  { name: "তানভীর আহমেদ", title: "সাপোর্ট অফিসার", email: "tanvir@demo.local" },
  { name: "মাহমুদা খাতুন", title: "সাপোর্ট অফিসার", email: "mahmuda@demo.local" },
] as const;

export const DEFAULT_SETTINGS: Settings = {
  org: { panelTitle: "সেবা সহায়ক AI প্যানেল", departmentName: "তথ্য ও যোগাযোগ প্রযুক্তি বিভাগ" },
  slaMinutes: 15,
  hours: { enabled: true, days: [0, 1, 2, 3, 4], start: "09:00", end: "17:00" },
  handoff: {
    enabled: true,
    offHoursMessage:
      "এখন আমাদের অফিস সময়ের বাইরে। আপনার অনুরোধটি নথিভুক্ত করা হয়েছে; পরবর্তী কার্যদিবসে একজন প্রতিনিধি এই কথোপকথনে যুক্ত হবেন।",
  },
  bot: {
    greeting: GREETING,
    fallback: FALLBACK,
    ai: true,
    maintenance: false,
    maintenanceMessage: "সেবা সহায়ক AI এখন রক্ষণাবেক্ষণের কাজে আছে। অনুগ্রহ করে কিছুক্ষণ পরে আবার চেষ্টা করুন অথবা মানব প্রতিনিধির সাথে কথা বলুন।",
  },
  retentionDays: 0,
  replyTemplates: [
    { id: "t1", title: "অভিবাদন ও পরিচয়", text: "আসসালামু আলাইকুম। আমি আপনার সাথে কথা বলছি — আপনার প্রশ্নটি দেখছি, একটু অপেক্ষা করুন।" },
    { id: "t2", title: "আরও তথ্য চাই", text: "আপনাকে সাহায্য করতে আমার আরও কিছু তথ্য দরকার। অনুগ্রহ করে আবেদন/রেফারেন্স নম্বর এবং সমস্যাটি সংক্ষেপে জানাবেন। (ব্যক্তিগত তথ্য হিসেবে পূর্ণ NID বা ফোন নম্বর এখানে লিখবেন না।)" },
    { id: "t3", title: "সংশ্লিষ্ট অফিসে যোগাযোগ", text: "বিষয়টি সমাধানের জন্য আপনাকে সংশ্লিষ্ট উপজেলা/জেলা অফিসে সরাসরি যোগাযোগ করতে হবে। সঙ্গে আপনার আবেদনের প্রমাণপত্র ও পরিচয়পত্রের মূল কপি নিয়ে যাবেন।" },
    { id: "t4", title: "সমাপনী", text: "আপনার প্রশ্নের উত্তর দেওয়া হয়েছে। আর কোনো সাহায্য লাগলে এই চ্যাটে জানাতে পারেন। ধন্যবাদ।" },
  ],
};

const WEEKDAYS_BN = ["রবিবার", "সোমবার", "মঙ্গলবার", "বুধবার", "বৃহস্পতিবার", "শুক্রবার", "শনিবার"];
const WEEKDAYS_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** Weekday names in the active language (index 0 = Sunday). */
export const weekdayName = (d: number) => (getFormatLang() === "en" ? WEEKDAYS_EN : WEEKDAYS_BN)[d];
export const WEEKDAYS = WEEKDAYS_BN;

/* ---------------- helpers ---------------- */

const TZ = "Asia/Dhaka";
const DAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Is `date` inside the configured support hours (Asia/Dhaka)? */
const DHAKA_MS = 6 * 3600_000;

/**
 * Minutes inside working hours between two instants (Asia/Dhaka, UTC+6, no DST).
 * Nights and non-working days count as zero, so an overnight case is not "overdue" at 9 a.m.
 * With working hours disabled this is plain elapsed time.
 */
export function workingMinutesBetween(fromMs: number, toMs: number, hours: Settings["hours"]): number {
  if (toMs <= fromMs) return 0;
  if (!hours.enabled) return Math.round((toMs - fromMs) / 60_000);
  const toMs_ = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return (h * 60 + m) * 60_000;
  };
  const open = toMs_(hours.start);
  const close = toMs_(hours.end);
  let dayStart = Math.floor((fromMs + DHAKA_MS) / 86_400_000) * 86_400_000 - DHAKA_MS; // Dhaka midnight, as a UTC instant
  let total = 0;
  for (let guard = 0; dayStart < toMs && guard < 800; guard++, dayStart += 86_400_000) {
    if (!hours.days.includes(new Date(dayStart + DHAKA_MS).getUTCDay())) continue;
    const a = Math.max(fromMs, dayStart + open);
    const b = Math.min(toMs, dayStart + close);
    if (b > a) total += b - a;
  }
  return Math.round(total / 60_000);
}

export function withinWorkingHours(hours: Settings["hours"], date: Date = new Date()): boolean {
  if (!hours.enabled) return true;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = DAY_INDEX[get("weekday")];
  const minutes = Number(get("hour")) * 60 + Number(get("minute"));
  const toMin = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  };
  return hours.days.includes(day) && minutes >= toMin(hours.start) && minutes < toMin(hours.end);
}

/** Plain-text summary of the support hours. */
export function hoursSummary(hours: Settings["hours"]): string {
  if (!hours.enabled) return tr("সার্বক্ষণিক", "24/7");
  const days = [...hours.days].sort();
  const label = days.length ? days.map((d) => weekdayName(d)).join(", ") : tr("কোনো দিন নয়", "No days");
  return `${label} · ${hours.start}–${hours.end}`;
}

/* ---------------- validation ---------------- */

export type SettingsErrors = Partial<Record<"panelTitle" | "departmentName" | "slaMinutes" | "hours" | "offHoursMessage" | "greeting" | "fallback" | "maintenanceMessage" | "retentionDays" | "templates", string>>;

export function validateSettings(s: Settings): SettingsErrors {
  const e: SettingsErrors = {};
  if (!s.org.panelTitle.trim()) e.panelTitle = tr("প্যানেলের নাম লিখুন।", "Enter the panel name.");
  if (!s.org.departmentName.trim()) e.departmentName = tr("বিভাগের নাম লিখুন।", "Enter the department name.");
  if (!Number.isInteger(s.slaMinutes) || s.slaMinutes < 1 || s.slaMinutes > 240) e.slaMinutes = tr("১ থেকে ২৪০ এর মধ্যে একটি পূর্ণসংখ্যা দিন।", "Enter a whole number between 1 and 240.");
  if (s.hours.enabled) {
    if (s.hours.days.length === 0) e.hours = "কমপক্ষে একটি কার্যদিবস নির্বাচন করুন।";
    else if (!/^\d{2}:\d{2}$/.test(s.hours.start) || !/^\d{2}:\d{2}$/.test(s.hours.end)) e.hours = tr("সময় সঠিক ফরম্যাটে দিন।", "Enter the time in a valid format.");
    else if (s.hours.start >= s.hours.end) e.hours = tr("শেষ সময় শুরুর সময়ের পরে হতে হবে।", "The end time must be after the start time.");
  }
  if (!s.handoff.offHoursMessage.trim()) e.offHoursMessage = tr("বার্তাটি খালি রাখা যাবে না।", "The message cannot be empty.");
  if (!s.bot.greeting.trim()) e.greeting = tr("স্বাগত বার্তা খালি রাখা যাবে না।", "The welcome message cannot be empty.");
  if (!s.bot.fallback.trim()) e.fallback = tr("বার্তাটি খালি রাখা যাবে না।", "The message cannot be empty.");
  if (!s.bot.maintenanceMessage.trim()) e.maintenanceMessage = tr("বার্তাটি খালি রাখা যাবে না।", "The message cannot be empty.");
  if (!Number.isInteger(s.retentionDays) || (s.retentionDays !== 0 && (s.retentionDays < 7 || s.retentionDays > 3650)))
    e.retentionDays = tr("০ (চিরকাল রাখুন) অথবা ৭ থেকে ৩৬৫০ দিন দিন।", "Enter 0 (keep forever) or 7 to 3650 days.");
  if (s.replyTemplates.length > 20) e.templates = tr("সর্বোচ্চ ২০টি টেমপ্লেট রাখা যাবে।", "At most 20 templates are allowed.");
  else if (s.replyTemplates.some((t) => !t.title.trim() || !t.text.trim())) e.templates = tr("প্রতিটি টেমপ্লেটে শিরোনাম ও লেখা থাকতে হবে।", "Each template needs a title and text.");
  return e;
}

/** Fills gaps from defaults so older/partial saved or imported data never breaks the app. */
export function mergeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Settings>;
  const d = DEFAULT_SETTINGS;
  return {
    org: { ...d.org, ...r.org },
    slaMinutes: typeof r.slaMinutes === "number" ? r.slaMinutes : d.slaMinutes,
    hours: { ...d.hours, ...r.hours, days: Array.isArray(r.hours?.days) ? r.hours.days : d.hours.days },
    handoff: { ...d.handoff, ...r.handoff },
    bot: { ...d.bot, ...r.bot },
    retentionDays: typeof r.retentionDays === "number" ? r.retentionDays : d.retentionDays,
    replyTemplates: Array.isArray(r.replyTemplates)
      ? r.replyTemplates.filter((t) => t && typeof t.title === "string" && typeof t.text === "string").map((t, i) => ({ id: typeof t.id === "string" && t.id ? t.id : `t${i + 1}`, title: t.title, text: t.text }))
      : d.replyTemplates,
  };
}
