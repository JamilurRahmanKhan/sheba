export type Lang = "bn" | "en";

/* Language for code that renders outside React (formatters, label tables). Set by AppProvider. */
let current: Lang = "bn";
export const setFormatLang = (l: Lang) => {
  current = l;
};
export const getFormatLang = (): Lang => current;
/** Inline bilingual string: tr("বাংলা", "English"). */
export const tr = (bn: string, en: string): string => (current === "en" ? en : bn);

const DICT = {
  "tab.chat": { bn: "চ্যাট", en: "Chat" },
  "tab.admin": { bn: "অ্যাডমিন ড্যাশবোর্ড", en: "Admin dashboard" },
  "tab.kb": { bn: "নলেজ বেস", en: "Knowledge base" },
  "chat.topics": { bn: "জনপ্রিয় বিষয়", en: "Popular topics" },
  "chat.recent": { bn: "সাম্প্রতিক কথোপকথন", en: "Recent conversations" },
  "chat.escalate": {
    bn: "উত্তরে সন্তুষ্ট নন? মানব প্রতিনিধির সাথে কথা বলুন",
    en: "Not satisfied? Talk to a human agent",
  },
  "chat.placeholder": { bn: "যেমন: জন্ম নিবন্ধন সনদের ফি কত?", en: "e.g. How much is the birth certificate fee?" },
  "chat.new": { bn: "+ নতুন", en: "+ New" },
} as const;

export type I18nKey = keyof typeof DICT;

export function translate(lang: Lang, key: I18nKey): string {
  return DICT[key][lang];
}
