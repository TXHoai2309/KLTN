import "server-only";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Embedded fallback synced verbatim with `docs/fixtures/price-reference-ha-giang.md` (`## Đi lại`)
 * so Vercel serverless production deployments (where `../../docs/fixtures` is outside the bundle)
 * read the exact same approved price reference as local dev and `APPROVED_ACCESS_ROUTE_PRICES`.
 */
const EMBEDDED_TRANSPORT_SECTION = [
  "## Đi lại",
  "",
  "| Khoản | Mức tham khảo | Ghi chú |",
  "|---|---|---|",
  "| Xăng RON 95 | ~23.000đ/lít | Hệ thống dùng làm mặc định cho tiền xăng |",
  "| Thuê xe máy số tại TP Hà Giang | 150.000–200.000đ/ngày | Thường kèm mũ bảo hiểm |",
  "| Thuê xe máy côn tay | 250.000–350.000đ/ngày | |",
  "| Thuê xe máy có người lái (easy rider) | 700.000–1.000.000đ/ngày | |",
  "| Xe khách giường nằm Hà Nội ⇄ TP Hà Giang | 250.000–400.000đ/lượt | 6–7 giờ, nhiều chuyến đêm |",
  "| Vé máy bay TP Hồ Chí Minh ⇄ Hà Nội (phổ thông) | 1.200.000–2.500.000đ/lượt | Thay đổi theo mùa |",
  "| Gửi xe máy qua đêm | 10.000–20.000đ/đêm | |",
].join("\n");

/**
 * Reads the owner-maintained `## Đi lại` table from `docs/fixtures/price-reference-ha-giang.md`
 * for train / sleeper-bus estimates (D10, ADR-52), falling back to the synced embedded copy in
 * production serverless bundles. Never invents routes or numbers outside the approved table.
 */
let cachedTransportSection: string | null | undefined;

export function readPriceReferenceTransportSection(): string | null {
  if (cachedTransportSection !== undefined) return cachedTransportSection;
  const candidates = [
    resolve(process.cwd(), "docs/fixtures/price-reference-ha-giang.md"),
    resolve(process.cwd(), "../../docs/fixtures/price-reference-ha-giang.md"),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      const raw = readFileSync(path, "utf8");
      const start = raw.indexOf("## Đi lại");
      if (start === -1) continue;
      const rest = raw.slice(start);
      const nextHeading = rest.indexOf("\n## ", 1);
      cachedTransportSection = (nextHeading === -1 ? rest : rest.slice(0, nextHeading)).trim();
      return cachedTransportSection;
    } catch {
      // Ignore read errors and fall through to embedded copy.
    }
  }
  cachedTransportSection = EMBEDDED_TRANSPORT_SECTION;
  return cachedTransportSection;
}
