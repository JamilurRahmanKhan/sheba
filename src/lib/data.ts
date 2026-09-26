import { getFormatLang, tr } from "./i18n";
/* Seed data ported from the original HTML prototype. Answers use "\n" for line breaks. */

export type TopicId =
  | "birth"
  | "nid"
  | "passport"
  | "trade"
  | "land"
  | "allowance"
  | "tax"
  | "complaint";

export interface Followup {
  label: string;
  answer: string;
}

export interface FaqTopic {
  id: TopicId;
  label: string;
  sample: string;
  keywords: string[];
  answer: string;
  followups: Followup[];
}

export const FAQ_TOPICS: FaqTopic[] = [
  {
    id: "birth",
    label: "জন্ম নিবন্ধন",
    sample: "আমার জন্ম নিবন্ধন সনদে নামের বানান ভুল আছে, কীভাবে সংশোধন করব?",
    keywords: ["জন্ম নিবন্ধন", "জন্ম সনদ", "birth", "মৃত্যু সনদ", "মৃত্যু নিবন্ধন"],
    answer:
      'জন্ম নিবন্ধন তথ্য সংশোধনের জন্য নিচের ধাপগুলো অনুসরণ করুন:\n১. bdris.gov.bd ওয়েবসাইটে গিয়ে "তথ্য সংশোধন" অপশনে যান\n২. নিবন্ধন নম্বর ও জন্ম তারিখ দিয়ে অনুসন্ধান করুন\n৩. সংশোধনযোগ্য তথ্য নির্বাচন করে সঠিক তথ্য লিখুন\n৪. প্রমাণপত্র স্ক্যান করে আপলোড করে আবেদন জমা দিন',
    followups: [
      {
        label: "ফি কত?",
        answer:
          "অনলাইন আবেদনের ফি ৫০ টাকা। জন্মের ৫ বছরের বেশি সময় পর সংশোধনের ক্ষেত্রে অতিরিক্ত ১০০ টাকা প্রযোজ্য হতে পারে।",
      },
      {
        label: "কী কাগজ লাগবে?",
        answer:
          "জাতীয় পরিচয়পত্র/জন্ম সনদের মূল কপি, শিক্ষাগত সনদ (থাকলে), এবং সংশোধনের স্বপক্ষে প্রমাণপত্র (যেমন পিতামাতার NID)।",
      },
      {
        label: "কতদিন সময় লাগে?",
        answer:
          "সাধারণত ৭-১৫ কার্যদিবসের মধ্যে সংশোধন সম্পন্ন হয়। জটিল ক্ষেত্রে যাচাইয়ের জন্য বেশি সময় লাগতে পারে।",
      },
    ],
  },
  {
    id: "nid",
    label: "জাতীয় পরিচয়পত্র (NID)",
    sample: "আমার এনআইডি কার্ড হারিয়ে গেছে, নতুন করে কীভাবে পাব?",
    keywords: ["nid", "এনআইডি", "পরিচয়পত্র", "national id", "id card"],
    answer:
      'হারানো NID পুনরুদ্ধারের জন্য:\n১. নিকটস্থ থানায় সাধারণ ডায়েরি (GD) করুন\n২. services.nidw.gov.bd -এ গিয়ে "রি-ইস্যু" আবেদন করুন\n৩. GD নম্বর ও প্রয়োজনীয় তথ্য দিয়ে আবেদন সম্পন্ন করুন\n৪. নির্ধারিত ফি পরিশোধ করে আবেদন জমা দিন',
    followups: [
      {
        label: "ফি কত?",
        answer: "সাধারণ রি-ইস্যু ফি ৩৪৫ টাকা, জরুরি সেবায় ৬৯০ টাকা (ভ্যাটসহ)।",
      },
      {
        label: "ঠিকানা পরিবর্তন",
        answer:
          'ঠিকানা পরিবর্তনের জন্য "তথ্য সংশোধন" অপশনে গিয়ে নতুন ঠিকানার প্রমাণপত্র (বিদ্যুৎ/গ্যাস বিল বা ভাড়ার চুক্তি) আপলোড করতে হবে।',
      },
      {
        label: "ছবি পরিবর্তন",
        answer:
          "ছবি পরিবর্তনের আবেদন সংশ্লিষ্ট উপজেলা নির্বাচন অফিসে সরাসরি করতে হয়, অনলাইনে সম্ভব নয়।",
      },
    ],
  },
  {
    id: "passport",
    label: "পাসপোর্ট সেবা",
    sample: "ই-পাসপোর্টের জন্য আবেদন করতে কী কী লাগবে?",
    keywords: ["পাসপোর্ট", "passport"],
    answer:
      "ই-পাসপোর্ট আবেদনের ধাপ:\n১. epassport.gov.bd -এ অনলাইন আবেদন ফর্ম পূরণ করুন\n২. NID/জন্ম সনদ, ঠিকানার প্রমাণ আপলোড করুন\n৩. নির্ধারিত ফি ব্যাংকে বা অনলাইনে পরিশোধ করুন\n৪. নির্ধারিত তারিখে বায়োমেট্রিক তথ্য দিতে আঞ্চলিক অফিসে যান",
    followups: [
      {
        label: "ফি কত?",
        answer:
          "৪৮ পাতার ৫ বছর মেয়াদি পাসপোর্টের নিয়মিত ফি ৪,০২৫ টাকা; জরুরি সেবায় ৬,৩২৫ টাকা।",
      },
      {
        label: "কতদিন লাগে?",
        answer:
          "নিয়মিত সেবায় ১৫ কার্যদিবস, জরুরি সেবায় ২ কার্যদিবসের মধ্যে ডেলিভারি দেওয়া হয়।",
      },
      {
        label: "জরুরি সেবা",
        answer:
          'জরুরি সেবা পেতে আবেদনের সময় "এক্সপ্রেস ডেলিভারি" নির্বাচন করে অতিরিক্ত ফি পরিশোধ করতে হবে।',
      },
    ],
  },
  {
    id: "trade",
    label: "ট্রেড লাইসেন্স",
    sample: "আমার ট্রেড লাইসেন্স নবায়ন করতে চাই, প্রক্রিয়া কী?",
    keywords: ["ট্রেড লাইসেন্স", "লাইসেন্স", "trade license", "trade licence"],
    answer:
      'ট্রেড লাইসেন্স নবায়নের জন্য:\n১. সংশ্লিষ্ট সিটি কর্পোরেশন/পৌরসভার ওয়েবসাইটে লগইন করুন\n২. পুরনো লাইসেন্স নম্বর দিয়ে "নবায়ন" অপশনে যান\n৩. হালনাগাদ তথ্য যাচাই করে নবায়ন ফি পরিশোধ করুন\n৪. নতুন লাইসেন্স ডাউনলোড করুন',
    followups: [
      {
        label: "ফি কত?",
        answer:
          "ব্যবসার ধরন ও মূলধন অনুযায়ী ফি ৫০০ থেকে ৫,০০০ টাকা পর্যন্ত হতে পারে।",
      },
      {
        label: "মেয়াদ কতদিন?",
        answer:
          "ট্রেড লাইসেন্স প্রতি অর্থবছরের জন্য (জুলাই-জুন) ইস্যু করা হয়, প্রতি বছর নবায়ন করতে হয়।",
      },
    ],
  },
  {
    id: "land",
    label: "ভূমি ও খতিয়ান",
    sample: "আমার জমির খতিয়ান অনলাইনে কীভাবে যাচাই করব?",
    keywords: ["ভূমি", "খতিয়ান", "জমি", "land", "khatian", "mutation"],
    answer:
      'অনলাইনে খতিয়ান যাচাইয়ের জন্য:\n১. land.gov.bd -এ গিয়ে "খতিয়ান অনুসন্ধান" নির্বাচন করুন\n২. জেলা, উপজেলা, মৌজা ও খতিয়ান/দাগ নম্বর দিন\n৩. তথ্য যাচাই করে প্রয়োজনে সার্টিফায়েড কপির জন্য আবেদন করুন',
    followups: [
      {
        label: "নামজারি কীভাবে করব?",
        answer:
          'নামজারির জন্য land.gov.bd -এ "নামজারি আবেদন" অপশনে গিয়ে দলিল, খতিয়ান ও ওয়ারিশান সনদসহ আবেদন করতে হবে।',
      },
      {
        label: "খাজনা কীভাবে দেব?",
        answer:
          'ভূমি উন্নয়ন কর (খাজনা) land.gov.bd -এর "অনলাইন খাজনা" অপশন থেকে পরিশোধ করা যায়।',
      },
    ],
  },
  {
    id: "allowance",
    label: "সামাজিক নিরাপত্তা ভাতা",
    sample: "বয়স্ক ভাতার জন্য কীভাবে আবেদন করব?",
    keywords: ["ভাতা", "বয়স্ক ভাতা", "বিধবা", "allowance", "pension"],
    answer:
      'সামাজিক নিরাপত্তা ভাতার আবেদনের জন্য:\n১. mis.bhata.gov.bd -এ গিয়ে "নতুন আবেদন" নির্বাচন করুন\n২. NID, বয়স/প্রতিবন্ধিতা প্রমাণপত্র আপলোড করুন\n৩. স্থানীয় ইউনিয়ন পরিষদ/পৌরসভার মাধ্যমে যাচাই করান\n৪. অনুমোদনের পর মোবাইল ব্যাংকিং হিসাবে ভাতা জমা হবে',
    followups: [
      {
        label: "বয়সসীমা কত?",
        answer:
          "বয়স্ক ভাতার জন্য পুরুষদের ৬৫ ও নারীদের ৬২ বছর বয়স হতে হয় (এলাকাভেদে পার্থক্য থাকতে পারে)।",
      },
      {
        label: "মাসিক পরিমাণ কত?",
        answer:
          "বর্তমানে মাসিক ভাতার পরিমাণ ৬০০ টাকা, যা সরকার নির্ধারিত হারে পরিবর্তিত হতে পারে।",
      },
    ],
  },
  {
    id: "tax",
    label: "আয়কর ও ভ্যাট",
    sample: "অনলাইনে আয়কর রিটার্ন কীভাবে দাখিল করব?",
    keywords: ["ট্যাক্স", "ভ্যাট", "আয়কর", "tax", "vat", "tin"],
    answer:
      "অনলাইনে আয়কর রিটার্ন দাখিলের জন্য:\n১. etaxnbr.gov.bd -এ নিবন্ধন করে লগইন করুন\n২. আয়ের উৎস ও তথ্য অনুযায়ী ফর্ম পূরণ করুন\n৩. প্রযোজ্য কর গণনা করে অনলাইনে পরিশোধ করুন\n৪. রিটার্ন সাবমিট করে প্রাপ্তি স্বীকারপত্র সংরক্ষণ করুন",
    followups: [
      {
        label: "শেষ তারিখ কবে?",
        answer:
          "সাধারণত প্রতি বছর ৩০ নভেম্বর ব্যক্তিগত আয়কর রিটার্ন দাখিলের শেষ তারিখ (নির্দিষ্ট বছরে পরিবর্তিত হতে পারে)।",
      },
      {
        label: "ই-টিন কীভাবে পাব?",
        answer:
          "etaxnbr.gov.bd -এ NID দিয়ে নিবন্ধন করলেই স্বয়ংক্রিয়ভাবে ই-টিন সনদ পাওয়া যায়।",
      },
    ],
  },
  {
    id: "complaint",
    label: "অভিযোগ জানানো",
    sample: "আমি একটি সরকারি সেবা নিয়ে অভিযোগ জানাতে চাই",
    keywords: ["অভিযোগ", "complaint"],
    answer:
      'সরকারি সেবা সংক্রান্ত অভিযোগ জানাতে:\n১. "নাগরিক অভিযোগ সেল" পোর্টালে গিয়ে নতুন অভিযোগ ফর্ম পূরণ করুন\n২. সংশ্লিষ্ট বিভাগ ও বিস্তারিত বিবরণ লিখুন\n৩. প্রয়োজনে প্রমাণ হিসেবে ছবি/নথি সংযুক্ত করুন\n৪. জমার পর একটি ট্র্যাকিং আইডি পাবেন, যা দিয়ে অগ্রগতি দেখতে পারবেন',
    followups: [
      {
        label: "কতদিনে সমাধান হয়?",
        answer:
          "অভিযোগের ধরন অনুযায়ী সাধারণত ৭-১৫ কার্যদিবসের মধ্যে প্রাথমিক জবাব দেওয়া হয়।",
      },
      {
        label: "ট্র্যাকিং কীভাবে করব?",
        answer:
          "অভিযোগ জমা দেওয়ার সময় প্রাপ্ত ট্র্যাকিং আইডি দিয়ে পোর্টালে লগইন করে অগ্রগতি দেখা যায়।",
      },
    ],
  },
];

export const GREETING =
  "আসসালামু আলাইকুম! আমি বাংলাদেশ সরকারের সেবা সহায়ক AI। জন্ম নিবন্ধন, জাতীয় পরিচয়পত্র, পাসপোর্ট, ভূমি সেবা সহ যেকোনো সরকারি সেবা সম্পর্কে প্রশ্ন করতে পারেন। (আমি শুধু সরকারি সেবা সংক্রান্ত প্রশ্নের উত্তর দিতে পারি।)";

export const FALLBACK =
  "দুঃখিত, প্রশ্নটি সম্পূর্ণ বুঝতে পারিনি। অনুগ্রহ করে আরেকটু স্পষ্ট করে লিখুন, পাশের তালিকা থেকে একটি বিষয় বেছে নিন, অথবা মানব প্রতিনিধির সাথে কথা বলুন।";

const TOPIC_EN: Record<string, string> = {
  birth: "Birth registration",
  nid: "National ID (NID)",
  passport: "Passport services",
  trade: "Trade licence",
  land: "Land & khatian",
  allowance: "Social security allowance",
  tax: "Income tax & VAT",
  complaint: "File a complaint",
};

const DEPT_EN: Record<string, string> = {
  "ভূমি সেবা": "Land services",
  "সামাজিক নিরাপত্তা": "Social security",
  "পাসপোর্ট": "Passport",
  "ট্রেড লাইসেন্স": "Trade licence",
  "সাধারণ": "General",
};

/** Translate a server-supplied Bengali topic label (e.g. on the dashboard) into the active language. */
export function localizeTopic(label: string): string {
  if (label === "অন্যান্য") return tr(label, "Other");
  const dept = DEPT_EN[label];
  if (dept) return tr(label, dept);
  const t = FAQ_TOPICS.find((x) => x.label === label);
  return t ? labelFor(t.id) : label;
}

export const GREETING_EN =
  "Assalamu alaikum! I am the Government Service Assistant AI. You can ask me about birth registration, national ID, passports, land services and other government services. (I can only answer questions about government services.)";

/** The stock greeting in English when English is active; custom greetings are shown as written. */
export function localizeGreeting(text: string): string {
  return getFormatLang() === "en" && text.startsWith("আসসালামু আলাইকুম! আমি বাংলাদেশ সরকারের সেবা সহায়ক AI") ? GREETING_EN : text;
}

const SYSTEM_TEXT_EN: [string, string][] = [
  ["দুঃখিত, প্রশ্নটি সম্পূর্ণ বুঝতে পারিনি।", "Sorry, I did not fully understand the question. Please write it a little more clearly, pick a topic from the list, or talk to a human agent."],
  ["একজন মানব প্রতিনিধির কাছে হস্তান্তর করা হয়েছে।", "Handed off to a human agent. Please wait."],
  ["আপনার অনুরোধ নথিভুক্ত করা হয়েছে।", "Your request has been recorded. A human agent will join this conversation on the next working day."],
  ["আপনার প্রশ্নটি সমাধান হিসেবে চিহ্নিত করা হয়েছে।", "Your question has been marked as resolved. Thank you."],
  ["আপনার প্রশ্নটি পুনরায় খোলা হয়েছে।", "Your question has been reopened."],
];

/** Stock system / fallback messages are stored in Bengali; show their English version when English is active. */
export function localizeSystemText(text: string): string {
  if (getFormatLang() !== "en") return text;
  const hit = SYSTEM_TEXT_EN.find(([bnStart]) => text.startsWith(bnStart));
  if (hit) return hit[1];
  const joined = /^প্রতিনিধি (.+) কথোপকথনে যুক্ত হয়েছেন।$/.exec(text);
  return joined ? `Agent ${joined[1]} has joined the conversation.` : text;
}

export function labelFor(id: string): string {
  const bn = FAQ_TOPICS.find((t) => t.id === id)?.label ?? id;
  return getFormatLang() === "en" ? (TOPIC_EN[id] ?? bn) : bn;
}

export function matchTopic(text: string): FaqTopic | null {
  const t = text.toLowerCase();
  for (const topic of FAQ_TOPICS) {
    for (const kw of topic.keywords) {
      if (t.includes(kw.toLowerCase())) return topic;
    }
  }
  return null;
}

/* ---------------- Escalations ---------------- */

export type EscStatus = "new" | "ongoing" | "resolved";

export type Priority = "normal" | "urgent";

export interface EscActivity {
  at: string;
  kind: "event" | "note";
  text: string;
  by?: string;
}

export interface Escalation {
  id: string;
  question: string;
  citizen: string;
  /** display clock (HH:MM) kept for the dashboard table */
  time: string;
  dept: string;
  status: EscStatus;
  /** ISO timestamps */
  createdAt: string;
  acceptedAt: string | null;
  resolvedAt: string | null;
  priority: Priority;
  assignee: string | null;
  /** how the case was resolved (required to close it) */
  resolution: string;
  activity: EscActivity[];
  /** an admin turned the resolution into a knowledge-base entry */
  kbAdded?: boolean;
}

/** Shape of the original prototype rows; expanded by `normalizeEscalation`. */
export type SeedEscalation = Pick<Escalation, "id" | "question" | "citizen" | "time" | "dept" | "status">;

export const SEED_ESCALATIONS: SeedEscalation[] = [
  { id: "VB-2026-0211", question: "ভূমি খতিয়ানের নামজারি বাতিল হলে করণীয় কী?", citizen: "মো. জাকির হোসেন", time: "১১:৪২", dept: "ভূমি সেবা", status: "new" },
  { id: "VB-2026-0212", question: "বিদেশে থাকা অবস্থায় NID সংশোধন করা যাবে কি?", citizen: "নুসরাত জাহান", time: "১১:১৮", dept: "NID", status: "ongoing" },
  { id: "VB-2026-0213", question: "বয়স্ক ভাতার আবেদন বাতিল হয়েছে, কারণ জানতে চাই", citizen: "আব্দুল বারেক", time: "১০:৫৫", dept: "সামাজিক নিরাপত্তা", status: "new" },
  { id: "VB-2026-0214", question: "পাসপোর্ট ডেলিভারি ৩ সপ্তাহ ধরে বিলম্বিত", citizen: "ফাহিম রহমান", time: "১০:৩০", dept: "পাসপোর্ট", status: "ongoing" },
  { id: "VB-2026-0215", question: "ট্রেড লাইসেন্সের ভুল ঠিকানা সংশোধনের উপায়", citizen: "শারমিন আক্তার", time: "০৯:৪৮", dept: "ট্রেড লাইসেন্স", status: "resolved" },
  { id: "VB-2026-0216", question: "জমির খাজনা অনলাইনে জমা দেওয়ার পর রসিদ পাইনি", citizen: "মো. ইলিয়াস", time: "০৯:১০", dept: "ভূমি সেবা", status: "resolved" },
];

export const STATUS_META: Record<EscStatus, { label: string; bg: string; color: string }> = {
  new: { get label() { return tr("নতুন", "New"); }, bg: "var(--info-soft)", color: "var(--info)" },
  ongoing: { get label() { return tr("চলমান", "In progress"); }, bg: "var(--warn-soft)", color: "var(--warn)" },
  resolved: { get label() { return tr("সমাধান হয়েছে", "Resolved"); }, bg: "var(--success-soft)", color: "var(--success)" },
};

export const TOPIC_STATS = [
  { label: "জন্ম নিবন্ধন", pct: 92, pctLabel: "২৮%" },
  { label: "জাতীয় পরিচয়পত্র", pct: 72, pctLabel: "২২%" },
  { label: "পাসপোর্ট সেবা", pct: 59, pctLabel: "১৮%" },
  { label: "ভূমি সেবা", pct: 49, pctLabel: "১৫%" },
  { label: "সামাজিক ভাতা", pct: 33, pctLabel: "১০%" },
  { label: "অন্যান্য", pct: 23, pctLabel: "৭%" },
];

export const RECENT_CONVERSATIONS = [
  { q: "পাসপোর্ট নবায়ন সংক্রান্ত", d: "২২ সেপ্টেম্বর" },
  { q: "ট্রেড লাইসেন্স ফি", d: "১৮ সেপ্টেম্বর" },
];

/* ---------------- Knowledge base ---------------- */

export interface KbInput {
  question: string;
  category: TopicId;
  answer: string;
  /** other ways citizens ask the same thing (one phrasing each) */
  aliases?: string[];
}

export interface KbItem {
  id: string;
  aliases?: string[];
  question: string;
  category: TopicId;
  uses: number;
  updated: string;
  active: boolean;
  answer: string;
  custom?: boolean;
}

export const SEED_KB: KbItem[] = [
  { id: "q1", question: "জন্ম নিবন্ধন সনদে নামের ভুল সংশোধন কীভাবে করব?", category: "birth", uses: 428, updated: "2026-09-20", active: true, answer: FAQ_TOPICS[0].answer },
  { id: "q2", question: "জন্ম নিবন্ধনের অনলাইন কপি কীভাবে ডাউনলোড করব?", category: "birth", uses: 351, updated: "2026-09-18", active: true, answer: 'bdris.gov.bd থেকে "অনলাইন কপি" অপশনে গিয়ে নিবন্ধন নম্বর ও জন্ম তারিখ দিলেই ডাউনলোড করা যায়।' },
  { id: "q3", question: "হারানো NID কার্ড পুনরায় তোলার প্রক্রিয়া কী?", category: "nid", uses: 390, updated: "2026-09-21", active: true, answer: FAQ_TOPICS[1].answer },
  { id: "q4", question: "NID-তে ঠিকানা পরিবর্তন করতে কী কী লাগবে?", category: "nid", uses: 276, updated: "2026-09-15", active: true, answer: 'নতুন ঠিকানার প্রমাণপত্র (বিদ্যুৎ/গ্যাস বিল বা ভাড়ার চুক্তি) আপলোড করে "তথ্য সংশোধন" আবেদন করতে হবে।' },
  { id: "q5", question: "পাসপোর্ট আবেদনের সময়সীমা ও ফি কত?", category: "passport", uses: 312, updated: "2026-09-19", active: true, answer: FAQ_TOPICS[2].answer },
  { id: "q6", question: "ই-পাসপোর্টের স্ট্যাটাস অনলাইনে কীভাবে চেক করব?", category: "passport", uses: 244, updated: "2026-09-12", active: false, answer: 'epassport.gov.bd -এ আবেদন আইডি ও জন্ম তারিখ দিয়ে "Application Status" থেকে চেক করা যায়।' },
  { id: "q7", question: "জমির খতিয়ান অনলাইনে যাচাই করার নিয়ম কী?", category: "land", uses: 198, updated: "2026-09-10", active: true, answer: FAQ_TOPICS[4].answer },
  { id: "q8", question: "ট্রেড লাইসেন্স নবায়নের ফি কত?", category: "trade", uses: 163, updated: "2026-09-08", active: true, answer: "ব্যবসার ধরন ও মূলধন অনুযায়ী ফি ৫০০ থেকে ৫,০০০ টাকা পর্যন্ত হতে পারে।" },
  { id: "q9", question: "বয়স্ক ভাতার আবেদনের বয়সসীমা কত?", category: "allowance", uses: 141, updated: "2026-09-05", active: true, answer: "পুরুষদের ৬৫ ও নারীদের ৬২ বছর বয়স হতে হয় (এলাকাভেদে পার্থক্য থাকতে পারে)।" },
  { id: "q10", question: "অনলাইনে আয়কর রিটার্নের শেষ তারিখ কবে?", category: "tax", uses: 120, updated: "2026-09-02", active: true, answer: "সাধারণত প্রতি বছর ৩০ নভেম্বর ব্যক্তিগত আয়কর রিটার্ন দাখিলের শেষ তারিখ।" },
];
