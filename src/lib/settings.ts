import { FALLBACK, GREETING } from "./data";

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
  bot: { greeting: string; fallback: string; maintenance: boolean; maintenanceMessage: string };
  /** delete finished conversations older than this many days; 0 = keep forever */
  retentionDays: number;
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
    maintenance: false,
    maintenanceMessage: "সেবা সহায়ক AI এখন রক্ষণাবেক্ষণের কাজে আছে। অনুগ্রহ করে কিছুক্ষণ পরে আবার চেষ্টা করুন অথবা মানব প্রতিনিধির সাথে কথা বলুন।",
  },
  retentionDays: 0,
};

export const WEEKDAYS = ["রবিবার", "সোমবার", "মঙ্গলবার", "বুধবার", "বৃহস্পতিবার", "শুক্রবার", "শনিবার"];

/* ---------------- helpers ---------------- */

const TZ = "Asia/Dhaka";
const DAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Is `date` inside the configured support hours (Asia/Dhaka)? */
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
  if (!hours.enabled) return "সার্বক্ষণিক";
  const days = [...hours.days].sort();
  const label = days.length ? days.map((d) => WEEKDAYS[d]).join(", ") : "কোনো দিন নয়";
  return `${label} · ${hours.start}–${hours.end}`;
}

/* ---------------- validation ---------------- */

export type SettingsErrors = Partial<Record<"panelTitle" | "departmentName" | "slaMinutes" | "hours" | "offHoursMessage" | "greeting" | "fallback" | "maintenanceMessage" | "retentionDays", string>>;

export function validateSettings(s: Settings): SettingsErrors {
  const e: SettingsErrors = {};
  if (!s.org.panelTitle.trim()) e.panelTitle = "প্যানেলের নাম লিখুন।";
  if (!s.org.departmentName.trim()) e.departmentName = "বিভাগের নাম লিখুন।";
  if (!Number.isInteger(s.slaMinutes) || s.slaMinutes < 1 || s.slaMinutes > 240) e.slaMinutes = "১ থেকে ২৪০ এর মধ্যে একটি পূর্ণসংখ্যা দিন।";
  if (s.hours.enabled) {
    if (s.hours.days.length === 0) e.hours = "কমপক্ষে একটি কার্যদিবস নির্বাচন করুন।";
    else if (!/^\d{2}:\d{2}$/.test(s.hours.start) || !/^\d{2}:\d{2}$/.test(s.hours.end)) e.hours = "সময় সঠিক ফরম্যাটে দিন।";
    else if (s.hours.start >= s.hours.end) e.hours = "শেষ সময় শুরুর সময়ের পরে হতে হবে।";
  }
  if (!s.handoff.offHoursMessage.trim()) e.offHoursMessage = "বার্তাটি খালি রাখা যাবে না।";
  if (!s.bot.greeting.trim()) e.greeting = "স্বাগত বার্তা খালি রাখা যাবে না।";
  if (!s.bot.fallback.trim()) e.fallback = "বার্তাটি খালি রাখা যাবে না।";
  if (!s.bot.maintenanceMessage.trim()) e.maintenanceMessage = "বার্তাটি খালি রাখা যাবে না।";
  if (!Number.isInteger(s.retentionDays) || (s.retentionDays !== 0 && (s.retentionDays < 7 || s.retentionDays > 3650)))
    e.retentionDays = "০ (চিরকাল রাখুন) অথবা ৭ থেকে ৩৬৫০ দিন দিন।";
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
  };
}
