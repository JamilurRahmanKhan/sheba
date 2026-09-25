export type Lang = "bn" | "en";

/* Only the strings the prototype translated. Everything else is Bengali-only for now. */
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
  "chat.placeholder": { bn: "আপনার প্রশ্ন লিখুন...", en: "Type your question..." },
  "chat.new": { bn: "+ নতুন", en: "+ New" },
} as const;

export type I18nKey = keyof typeof DICT;

export function translate(lang: Lang, key: I18nKey): string {
  return DICT[key][lang];
}
