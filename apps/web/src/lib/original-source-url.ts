/** No requests or DNS lookups. This validates a citation destination, not its contents. */
export function originalSourceUrl(value: string): string | null {
  if (value.length > 2000 || /[\u0000-\u0020\u007f]/u.test(value)) return null;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    const host = url.hostname.toLowerCase().replace(/\.$/u, "");
    const ip = host.replace(/^\[|\]$/gu, "");
    if (/^\d+\.\d+\.\d+\.\d+$/u.test(ip)) {
      const [a,b] = ip.split(".").map(Number);
      if (a === 0 || a === 10 || a === 127 || a! >= 224 || a === 169 && b === 254 || a === 172 && b! >= 16 && b! <= 31 || a === 192 && b === 168 || a === 100 && b! >= 64 && b! <= 127 || a === 198 && (b === 18 || b === 19)) return null;
    } else if (ip.includes(":")) {
      if (!/^[23]/u.test(ip) || /^2001:db8:/iu.test(ip)) return null;
    } else if (!host.includes(".") || /(?:^|\.)(?:localhost|local|internal|invalid|test)$/iu.test(host)) return null;
    if (/(?:^|\.)(?:vercel-storage\.com|blob\.core\.windows\.net)$/iu.test(host)) return null;
    const path = decodeURIComponent(url.pathname);
    if (/(?:^|\/)admin(?:\/|$)|\/api\//iu.test(path)) return null;
    const privateKey = /^(?:token|access_token|api_?key|key|auth|authorization|session|password|secret|signature|sig|se|sp|sv|sr|skoid|sktid|skt|ske|sks|skv|x-amz-.+|x-goog-.+)$/iu;
    if ([...url.searchParams.keys(), ...new URLSearchParams(url.hash.slice(1)).keys()].some(key => privateKey.test(key))) return null;
    return url.href;
  } catch { return null; }
}
