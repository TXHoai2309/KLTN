export const percentile = (values, p) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] : null;
};
export const summarize = values => ({ n: values.length, p50: percentile(values, .5), p95: percentile(values, .95), min: percentile(values, 0), max: percentile(values, 1) });
// Object insertion order is not part of a DTO; array order remains significant.
export const canonicalJson = value => JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
export function safeOrigin(value) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
    !(url.protocol === "https:" || url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new Error("Expected credential-free HTTPS origin or loopback HTTP");
  return url.origin;
}
export function sampleCount(value = 3) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 5) throw new Error("Only 1..5 sequential samples allowed");
  return n;
}
export function resourceKind(type, url) {
  if (/\.(woff2?|ttf)(?:\?|$)/.test(url)) return "font";
  if (type === "script" || /\.m?js(?:\?|$)/.test(url)) return "js";
  if (type === "css" || /\.css(?:\?|$)/.test(url)) return "css";
  if (/\.(mp4|webm)(?:\?|$)/.test(url)) return "video";
  if (["img", "image"].includes(type) || /\.(png|jpe?g|webp|avif|svg)(?:\?|$)/.test(url)) return "image";
  return "other";
}
// Only public pathname, never query parameters, cookies, headers or response text.
export function safeResource(value) {
  const url = new URL(value);
  return { origin: url.origin, path: url.pathname };
}
