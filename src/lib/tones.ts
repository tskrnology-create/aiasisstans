// İzin verilen içerik tonları (API doğrulaması ve ekran seçimi ortak kullanır).
export const TONES = [
  "samimi",
  "profesyonel",
  "esprili",
  "resmi",
  "heyecanlı",
  "lüks",
] as const;

export type Tone = (typeof TONES)[number];

export function isTone(value: unknown): value is Tone {
  return typeof value === "string" && (TONES as readonly string[]).includes(value);
}
