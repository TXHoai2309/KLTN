/** Plain, deterministic summary. No LLM, HTML or editor-control markup. */
export function shortDescription(description: string, limit = 1000): string {
  const text = description
    .normalize("NFC")
    .replace(/<[^>]*>/gu, " ")
    .replace(/\[(.*?)\]\([^)]*\)/gu, "$1")
    .replace(/[`*_#]/gu, "")
    .replace(/\bSao chép\b/giu, "")
    .replace(/\s+/gu, " ")
    .trim();
  if (text.length <= limit) return text;
  const bounded = text.slice(0, limit - 1);
  const sentence = [...bounded.matchAll(/[.!?](?=\s|$)/gu)].at(-1)?.index;
  if (sentence !== undefined && sentence > 0)
    return bounded.slice(0, sentence + 1);
  const space = bounded.lastIndexOf(" ");
  return (space > 0 ? bounded.slice(0, space) : "") + "…";
}
