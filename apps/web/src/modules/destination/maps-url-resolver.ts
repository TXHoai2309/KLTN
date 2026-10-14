import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import { AppError } from "@/server/http/app-error";

export type MapsResolution = {
  status: "RESOLVED" | "AMBIGUOUS" | "UNRESOLVED" | "UNSUPPORTED";
  reason: string;
  latitude?: number;
  longitude?: number;
  provider?: "EXPLICIT_MAPS_URL";
};
const hosts = new Set([
  "google.com",
  "www.google.com",
  "maps.google.com",
  "google.com.vn",
  "www.google.com.vn",
  "maps.google.com.vn",
  "maps.app.goo.gl",
  "goo.gl",
]);
export function mapsUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new AppError(
      "INVALID_MAPS_URL",
      "URL Google Maps không hợp lệ.",
      400,
    );
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !hosts.has(url.hostname) ||
    isIP(url.hostname) ||
    /[\u0000-\u001f\u007f]/u.test(value) ||
    (url.hostname === "goo.gl"
      ? !url.pathname.startsWith("/maps/")
      : url.hostname === "maps.app.goo.gl"
        ? url.pathname.length <= 1
        : !/^\/maps(?:\/|$)/u.test(url.pathname))
  ) {
    throw new AppError(
      "INVALID_MAPS_URL",
      "Chỉ dùng URL HTTPS Google Maps công khai, không chứa thông tin đăng nhập.",
      400,
    );
  }
  if (url.href.length > 2000)
    throw new AppError("INVALID_MAPS_URL", "URL tối đa 2.000 ký tự.", 400);
  return url;
}
export function explicitMapsCoordinates(url: URL): MapsResolution {
  const unsupported: MapsResolution = {
    status: "UNSUPPORTED",
    reason:
      "Dán liên kết có query=vĩ_độ,kinh_độ hoặc tọa độ điểm trong liên kết Chia sẻ. Tâm camera @ và tìm theo tên không xác định được vị trí.",
  };
  if (
    url.searchParams.has("query_place_id") ||
    url.searchParams.has("place_id")
  )
    return {
      ...unsupported,
      reason:
        "Liên kết Place ID cần Google Places chưa được bật. Dùng liên kết chứa tọa độ điểm chính xác.",
    };
  if (["maps.app.goo.gl", "goo.gl"].includes(url.hostname)) return unsupported;
  const pairs: [number, number][] = [];
  for (const key of ["query", "q"]) {
    const values = url.searchParams.getAll(key);
    if (values.length > 1)
      return {
        status: "AMBIGUOUS",
        reason: "Liên kết có nhiều truy vấn vị trí.",
      };
    const value = values[0];
    if (value && /^\/maps(?:\/search\/?|\/?)$/u.test(url.pathname)) {
      const match =
        /^\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*,\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*$/u.exec(
          value,
        );
      if (match) pairs.push([Number(match[1]), Number(match[2])]);
    }
  }
  // !3d/!4d identify a point, unlike @ which is a camera center. Reject multiple/conflicting points.
  let path: string;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    return { status: "UNRESOLVED", reason: "Mã hóa URL không hợp lệ." };
  }
  for (const match of (url.pathname.startsWith("/maps/place/")
    ? path
    : ""
  ).matchAll(/!3d([+-]?\d+(?:\.\d+)?)!4d([+-]?\d+(?:\.\d+)?)(?=!|\/|$)/gu))
    pairs.push([Number(match[1]), Number(match[2])]);
  if (!pairs.length) return unsupported;
  if (
    pairs.some(
      ([lat, lng]) =>
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        Math.abs(lat) > 90 ||
        Math.abs(lng) > 180,
    )
  )
    return {
      status: "UNRESOLVED",
      reason: "Tọa độ nằm ngoài giới hạn hợp lệ.",
    };
  if (
    pairs.some((pair) => pair[0] !== pairs[0]![0] || pair[1] !== pairs[0]![1])
  )
    return {
      status: "AMBIGUOUS",
      reason: "Liên kết chứa nhiều tọa độ điểm khác nhau.",
    };
  return {
    status: "RESOLVED",
    latitude: pairs[0]![0],
    longitude: pairs[0]![1],
    provider: "EXPLICIT_MAPS_URL",
    reason: "Đã lấy tọa độ điểm được ghi rõ trong URL Google Maps.",
  };
}
export function publicIp(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a! >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b! >= 16 && b! <= 31) ||
      (a === 192 && (b === 168 || b === 0)) ||
      (a === 100 && b! >= 64 && b! <= 127) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  // Allow globally routed IPv6 only; exclude mapped IPv4, local/link-local/loopback and documentation ranges.
  return (
    isIP(address) === 6 &&
    /^[23][0-9a-f]{3}:/iu.test(address) &&
    !/^2001:db8:/iu.test(address)
  );
}
async function redirectLocation(
  url: URL,
  signal: AbortSignal,
): Promise<string | null> {
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some((a) => !publicIp(a.address)))
    throw Error("unsafe DNS");
  const pinned = addresses[0]!;
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: "GET",
        family: pinned.family,
        signal,
        maxHeaderSize: 16384,
        headers: { Accept: "text/html", "User-Agent": "KLTN-MapsResolver/1" },
        lookup: (_host, _options, callback) =>
          callback(null, pinned.address, pinned.family),
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = res.headers.location;
        res.destroy(); // Redirects only: no HTML scraping, cookies, admin token or unbounded body.
        if (
          status >= 300 &&
          status < 400 &&
          location &&
          location.length <= 2000
        )
          resolve(location);
        else resolve(null);
      },
    );
    req.once("error", reject);
    req.end();
  });
}
export async function resolveMapsUrl(
  value: string,
  options: { redirect?: typeof redirectLocation; signal?: AbortSignal } = {},
): Promise<MapsResolution> {
  let url = mapsUrl(value);
  const direct = explicitMapsCoordinates(url);
  if (
    direct.status !== "UNSUPPORTED" ||
    !["maps.app.goo.gl", "goo.gl"].includes(url.hostname)
  )
    return direct;
  const signal = options.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(5000)])
    : AbortSignal.timeout(5000);
  try {
    for (let count = 0; count < 4; count++) {
      signal.throwIfAborted();
      const location = await Promise.race([
        (options.redirect ?? redirectLocation)(url, signal),
        new Promise<never>((_, reject) =>
          signal.addEventListener("abort", () => reject(Error("timeout")), {
            once: true,
          }),
        ),
      ]);
      if (!location)
        return {
          status: "UNRESOLVED",
          reason: "Không đọc được redirect. Dùng URL đầy đủ chứa tọa độ điểm.",
        };
      url = mapsUrl(new URL(location, url).href); // Revalidate every redirect, including long Google URLs.
      const result = explicitMapsCoordinates(url);
      if (!["maps.app.goo.gl", "goo.gl"].includes(url.hostname)) return result;
    }
    return {
      status: "UNRESOLVED",
      reason: "Liên kết chuyển hướng quá nhiều lần.",
    };
  } catch {
    return {
      status: "UNRESOLVED",
      reason:
        "Liên kết rút gọn không an toàn hoặc hết thời gian xử lý. Dùng URL đầy đủ chứa tọa độ điểm.",
    };
  }
}
const attempts = new Map<string, { count: number; until: number }>();
export function admitMapsResolution(actorId: string, now = Date.now()) {
  for (const [id, item] of attempts) if (item.until <= now) attempts.delete(id);
  const item = attempts.get(actorId) ?? { count: 0, until: now + 60_000 };
  if (item.count >= 12 || (!attempts.has(actorId) && attempts.size >= 2000))
    throw new AppError(
      "MAPS_RATE_LIMIT",
      "Bạn đang kiểm tra quá nhanh. Thử lại sau một phút.",
      429,
    );
  item.count++;
  attempts.set(actorId, item);
}
