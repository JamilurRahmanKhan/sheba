/** Masks phone numbers, NID-length numbers and e-mail addresses (Latin or Bengali digits) before text is stored. */
const D = "[0-9০-৯]";
// 01XXXXXXXXX or +8801XXXXXXXXX / 8801XXXXXXXXX (operator digit 3-9), in Latin or Bengali digits
const PHONE = new RegExp(`(?<!${D})(?:\\+?[8৮][8৮][0০]?|[0০])[1১][3-9৩-৯]${D}{8}(?!${D})`, "g");
const NID = new RegExp(`(?<!${D})(?:${D}{17}|${D}{13}|${D}{10})(?!${D})`, "g");
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;

export function maskPii(text: string): string {
  return text.replace(EMAIL, "[ইমেইল]").replace(PHONE, "[ফোন নম্বর]").replace(NID, "[NID নম্বর]");
}
