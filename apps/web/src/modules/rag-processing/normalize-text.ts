export const NORMALIZATION_VERSION = "nfc-lines-trim-v1";
export function normalizeText(text: string): string {
  return text.replace(/\r\n?/g, "\n").normalize("NFC").trim();
}
