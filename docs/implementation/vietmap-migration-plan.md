# Kế hoạch migration: bỏ hoàn toàn Stadia Maps → VietMap

> **ĐÃ HỢP NHẤT** vào [đặc tả tổng `vietmap-migration-spec.md`](vietmap-migration-spec.md). File này giữ làm bản ghi quá trình chốt quyết định; khi chia task hoặc implement, dùng file đặc tả tổng — file đó là nguồn duy nhất.

- **Trạng thái:** CHỐT — owner đã duyệt toàn bộ quyết định ngày 2026-10-23. Được phép triển khai.
- **Contract chính thức:** [US-40 — VietMap replaces Stadia](../stories/US-40-vietmap-provider-migration.md)
- **Quyết định kiến trúc:** [ADR-19](../decisions.md) (supersedes ADR-17, ADR-18)
- **Phạm vi:** thay bản đồ nền và routing provider. **Bỏ hẳn Stadia** — không fallback, không dual-provider.
- **Không thuộc phạm vi:** đổi MapLibre, đổi planner/validator, đổi Prisma schema, Matrix/TSP/Geocode/Reverse/Traffic.

---

## 0. Nhật ký quyết định (đã chốt — không mở lại khi code)

| # | Quyết định | Chốt |
| --- | --- | --- |
| D1 | Cổng bằng chứng | Có 2 key VietMap **trước** khi sửa code; chạy probe thật ≥3 cặp Hà Giang × 2 vehicle |
| D2 | Đường đi tile key | `NEXT_PUBLIC_VIETMAP_MAP_KEY` (publishable) + referer whitelist; ADR-19; thay assert `map.test.tsx:115` |
| D3 | Style | Light = `tm` (street), Dark = `dm` |
| D4 | Attribution | Text `© VIETMAP` trong control compact, không logo |
| D5 | Route `time` | Không truyền → VietMap lấy giờ gọi; ghi nhận phi tất định là known limitation |
| D6 | Credit UI | `VietMap · Thời gian di chuyển ước tính` (bỏ mọi claim về giao thông thời gian thực) |
| D7 | `provider` | `z.literal("VIETMAP")` |
| D8 | Vị trí module | Giữ `modules/trip-validation/`, chỉ đổi tên file |
| D9 | Script | Xoá 5 file Stadia (1 adapter + 4 script); thêm **chỉ** `probe-vietmap-routes.mjs` (chỉ routing) |
| D10 | Browser E2E | **Không** viết script; dùng checklist tay + ảnh chụp |
| D11 | Domain | Chỉ whitelist Production domain + `http://localhost:3010`; preview hỏng là chấp nhận được |
| D12 | Hard cap | Giữ nguyên 27 cặp; **không** thêm cap thứ hai |
| D13 | Breaker vị trí | Trong adapter `vietmap-route.ts` (bảo vệ mọi caller) |
| D14 | Breaker trạng thái | Flag in-process, TTL 15 phút, chỉ trip khi `OVER_DAILY_LIMIT` |
| D15 | Breaker hành vi | Mở → trả `UNAVAILABLE` ngay, không gọi provider, không cache route |
| D16 | Story | Tạo `docs/stories/US-40-vietmap-provider-migration.md` (READY) |
| D17 | Báo cáo/slide | Có mục "Trước/Sau" + sơ đồ mới (§11) |
| D18 | Ký ACCEPTED | Owner tự ký, điều kiện: bảng PASS/FAIL/NOT_RUN trong file này |
| D19 | Phạm vi docs | ADR-19 Accepted ngay; story cũ chỉ thêm banner, không viết lại lịch sử |
| D20 | Git | Worktree riêng, 3 commit (basemap / routing / cleanup+docs), **không push** |
| D21 | Quota monitoring | Chỉ log `code` phía server + ghi hạn/ngày hết hạn vào environment guide |

---

## 1. Kết luận

Chuyển sang VietMap là **phù hợp** với đề tài và **nên làm**:

- Dữ liệu đường bộ Việt Nam (600.000+ km, 34 tỉnh), POI, biển báo; cập nhật hàng tuần.
- Có profile `motorcycle` riêng — khớp `TripTransport.MOTORCYCLE`, đường Hà Giang khác biệt rõ giữa xe máy và ô tô.
- Nhãn bản đồ tiếng Việt, đúng sản phẩm "Trợ lý du lịch Hà Giang".
- Xoá được lỗi đang tồn tại: Stadia Production trả tile **401** do domain auth.

Đây là **provider migration**, không phải refactor kiến trúc: MapLibre đã là renderer trực tiếp, `RouteProvider` đã tách planner khỏi vendor, `getTravelRoute()` là cửa duy nhất của business layer.

**Ước lượng:** ~45 lượt file — 12 file code + 2 env, 4 Route Handler, 12 test, 7 script, 5 file xoá, 9 docs (5 docs đã xong trong phiên chốt kế hoạch). Khoảng **2–3 ngày công**, chưa tính thời gian chờ duyệt key VietMap.

---

## 2. Hiện trạng phụ thuộc Stadia (đã kiểm chứng)

### 2.1. Bản đồ nền

| File | Vai trò |
| --- | --- |
| `apps/web/src/modules/map/map-config.ts` | `stadiaStyles` (2 URL public, không key) + `mapStyle()` |
| `apps/web/src/components/map/destination-map.tsx` | `mapStyle(resolvedTheme)` |
| `apps/web/src/components/trip-planner/itinerary-map.tsx` | `mapStyle(resolvedTheme)` |
| `apps/web/src/app/admin/destinations/destination-location-picker.tsx` | `mapStyle(resolvedTheme)` |
| `apps/web/src/components/in-trip/manual-location-picker.tsx` | `mapStyle(resolvedTheme)` |

`maplibre-renderer.ts`, `itinerary-map-renderer.ts`, `map-session.ts`, `map-model.ts` **không có gì Stadia-specific** — chỉ thêm attribution.

### 2.2. Routing

```
Planner  → planner-routes.ts (createStadiaRoutesProvider) ─┐
US-29B   → travel-time.ts ← getTravelRoute() ──────────────┼→ stadia-route.ts → api.stadiamaps.com/route/v1
US-30/32 → trip-save-server.ts ────────────────────────────┤
US-35/36/37 → in-trip-validation.ts (inject getRoute) ─────┘
```

Importer `getTravelRoute` (5):

- `apps/web/src/app/api/trips/[id]/edits/ai/route.ts`
- `apps/web/src/app/api/trips/[id]/edits/preview/route.ts`
- `apps/web/src/app/api/trips/[id]/edits/apply/route.ts`
- `apps/web/src/app/api/trips/[id]/in-trip/preview/route.ts`
- `apps/web/src/modules/trip-save/trip-save-server.ts`

Importer **type** `TravelRoute` (dễ bỏ sót khi rename):

- `apps/web/src/modules/trip-save/trip-save-service.ts`
- `apps/web/src/modules/trip-edit/trip-edit-service.ts`

### 2.3. Hard-code phải đổi

| Vị trí | Nội dung |
| --- | --- |
| `planner-contract.ts:23` | `provider: z.literal("STADIA_MAPS").nullable()` |
| `planner-routes.ts:19` | gán `provider: "STADIA_MAPS"` |
| `planner-runtime.ts:12` | `apiKey: () => ENV.STADIA_MAPS_API_KEY` |
| `planner-presentation.tsx:52,67,75` | 3 chỗ hiển thị "Stadia Maps" (trong đó dòng 67 là điều kiện `provider === "STADIA_MAPS"`) |
| `planner-service.ts:56` | **Chuỗi thứ 4 hiển thị cho người dùng**: warning `ROUTE_ESTIMATE` mở đầu bằng "Stadia Maps: …" — dễ bị bỏ sót vì nằm trong service, không phải component |
| `__fixtures__/planner-fixtures.ts:16` | fixture provider |
| `.env.schema:122`, `.env.example:38-40` | `STADIA_MAPS_API_KEY` |

### 2.4. Test đang khoá hành vi Stadia (12 file)

`map.test.tsx:112-115` (**assert style URL không chứa key**), `map-location-picker.test.ts`, `trip-theme.vitest.test.ts`, `travel-time.vitest.test.ts` (import trực tiếp adapter), `planner-stadia.vitest.test.ts`, `planner-boundaries.vitest.test.ts` (assert `provider === "STADIA_MAPS"`, header `Stadia-Auth`), `planner-engine.vitest.test.ts`, `planner-ui.vitest.test.ts:32,50` (assert chuỗi "Stadia Maps"), `planner-fixtures.ts`, `provider-env.vitest.test.ts`, `trip-save.vitest.test.ts:3` (import `../trip-validation/stadia-route` — dễ bỏ sót vì không có chữ "Stadia" trong tên test), `us37-test.vitest.test.ts:272` (chỉ comment, nhưng phải sửa để `grep` sạch).

---

## 3. Dữ kiện VietMap đã probe thật (2026-10-23)

### 3.1. Tilemap

```
https://maps.vietmap.vn/maps/styles/tm/style.json?apikey={key}   # light (D3)
https://maps.vietmap.vn/maps/styles/dm/style.json?apikey={key}   # dark  (D3)
https://maps.vietmap.vn/maps/styles/lm/style.json?apikey={key}   # light thay thế
https://maps.vietmap.vn/maps/styles/hm/style.json?apikey={key}   # hybrid
```

Kết quả probe:

- `GET .../lm/style.json?apikey=<key sai>` → **HTTP 200**, trả style đầy đủ.
- Style nhúng key vào tile source: `.../maps/tiles/vlc-20261015/{z}/{x}/{y}.pbf?apikey=<key>`.
- `GET .../tiles/.../10/814/463.pbf` → **401** (cả không key và key sai).
- `sources` **không có** `attribution`; `glyphs`/`sprite` cũng không.
- `maxzoom = 15` — trùng `maxZoom: 15` đang có trong renderer.

Hệ quả: **không còn chế độ keyless**. Mọi môi trường, kể cả localhost, cần key + referer hợp lệ (D11).

### 3.2. Route v4

```
GET https://maps.vietmap.vn/api/route/v4?apikey={key}
    &point={lat},{lng}&point={lat},{lng}
    &vehicle=car|motorcycle
    &points_encoded=true|false
```

| Field | Ý nghĩa |
| --- | --- |
| `code` | `OK` / `INVALID_REQUEST` / `OVER_DAILY_LIMIT` / `MAX_POINTS_EXCEED` / `ERROR_UNKNOWN` / `ZERO_RESULTS` |
| `paths[0].distance` | **mét** |
| `paths[0].time` | **mili-giây** |
| `paths[0].points` | polyline5 nếu `points_encoded=true` |
| `paths[0].bbox` | `[minLon, minLat, maxLon, maxLat]` |

Tài liệu VietMap **mâu thuẫn** về thứ tự toạ độ khi `points_encoded=false`: trang Route v4 ghi `[lat,lng]`, file `routing.txt` chính thức ghi `[lon,lat]`. **Không tin docs** — validate runtime.

### 3.3. Hạn mức & key

- 60.000 transaction miễn phí; route = `⌊points/5⌋ + 1`; bản đồ nền = **25 tile / 1 transaction**.
- Planner 27 cặp × 1 leg = **27 transaction/lần lập lịch** (mỗi leg 2 điểm ⇒ `⌊2/5⌋+1 = 1`).
- Có giới hạn ngày: `OVER_DAILY_LIMIT` trả HTTP 200 **không có** `paths`.
- Tilemap key: thiết kế để nhúng client, **phải** khai báo referer. Service key: "tuyệt đối không để lộ ở frontend".

---

## 4. Sáu cạm bẫy phải xử lý (bản kế hoạch đầu tiên bỏ sót)

### 4.1. `NEXT_PUBLIC_*` phá invariant đang được test bảo vệ

`map.test.tsx:115` assert `Object.values(stadiaStyles).every(url => !url.includes("api_key"))`, biểu diễn của ADR-17 + `AGENTS.md:27`. Theo D2:

1. ADR-19 ghi rõ tile key là **publishable key**, không phải server secret.
2. Thay assert bằng invariant đúng bản chất: **routing key không xuất hiện trong bundle/response client**.
3. Sửa `AGENTS.md` dòng 27.

### 4.2. Key sai → map trắng, không phải lỗi rõ

Style 200 + tile 401. Repo đã bind `map.on("error")` → UI vào `"error"` → "Bản đồ chưa khả dụng". **Giữ nguyên**, không thêm retry/timeout mới. Kiểm tra bằng checklist tay (§9).

### 4.3. Thiếu attribution

VietMap style không mang attribution. Thêm ở cả `maplibre-renderer.ts` và `itinerary-map-renderer.ts`:

```ts
attributionControl: { compact: true, customAttribution: "© VIETMAP" }
```

### 4.4. Thứ tự toạ độ không đáng tin

Chuẩn hoá về GeoJSON `[lng, lat]`, validate từng điểm bằng `isValidMapCoordinate()` (`modules/map/map-model.ts`). Lưu ý: `decodeRouteLine()` hiện tại là polyline **6** — **không tái sử dụng** cho VietMap (polyline 5); hoặc dùng `points_encoded=false` + validate cả hai thứ tự.

### 4.5. HTTP 200 kèm `code` lỗi

Map reason code, **không thêm reason mới**:

| Tình huống | Reason |
| --- | --- |
| `ZERO_RESULTS` | `NO_ROUTE` |
| `OVER_DAILY_LIMIT` | `UNAVAILABLE` (+ trip breaker) |
| `MAX_POINTS_EXCEED`, `INVALID_REQUEST` | `INVALID_RESPONSE` |
| `ERROR_UNKNOWN`, HTTP ≠ 2xx | `UNAVAILABLE` |
| abort/timeout | `TIMEOUT` |
| thiếu key | `NOT_CONFIGURED` |
| vehicle không hỗ trợ | `UNSUPPORTED_MODE` |
| JSON sai / quá `MAX_*_RESPONSE_BYTES` / toạ độ sai | `INVALID_RESPONSE` |

### 4.6. Routing key trên query string

Không log URL; không đưa URL vào `AppError`/response; giữ test `not.toContain(secret)`; format số bằng template thô — **không** `toLocaleString` (dấu phẩy thập phân phá query).

---

## 5. Kiến trúc đích

```
Browser
  DestinationMap · ItineraryMap · Admin picker · In-trip picker
     └─ mapStyle(theme) → MapLibre GL → maps.vietmap.vn/maps/styles/{tm|dm}/style.json?apikey=…
                                        + "© VIETMAP"

Server
  Planner · US-29B · US-30/32 · US-35/36/37
     └─ getTravelRoute()                        (contract không đổi)
           └─ trip-validation/vietmap-route.ts  (adapter duy nhất biết VietMap)
                 ├─ breaker in-process (D13–D15)
                 └─ GET /api/route/v4
```

### 5.1. Đặc tả breaker (D13–D15)

```
state: { openUntil: number | null }   // module-level, mỗi instance một bản
on call:
  if (openUntil && Date.now() < openUntil) return unavailable("UNAVAILABLE")  // không gọi provider
  ...
  if (code === "OVER_DAILY_LIMIT") openUntil = Date.now() + 15 * 60_000
  if (code === "ZERO_RESULTS")      không đổi openUntil
```

Ràng buộc: không cache route; không đổi reason code; `ZERO_RESULTS`/`UNAVAILABLE`/`TIMEOUT` **không** trip; test được TTL bằng clock tiêm vào.

**Giới hạn đã biết (chấp nhận):** trên Vercel serverless, breaker chỉ đúng trong một instance — 3 request song song có thể vào 3 instance và cùng gọi provider. Nó giảm thiệt hại, **không** bảo đảm chặn tuyệt đối. Ghi vào ADR-19 và story.

---

## 6. Các bước thực hiện

### Bước 0 — Chuẩn bị (chặn toàn bộ)
- [ ] Tạo tài khoản VietMap; tạo **tilemap key** (referer: production domain + `http://localhost:3010`) và **routing key** riêng.
- [ ] Ghi ngày hết hạn key vào `docs/implementation/environment-deployment.md`.
- [ ] Viết `probe-vietmap-routes.mjs`, chạy thật: ≥3 cặp Hà Giang × CAR/MOTORCYCLE; lưu output.
- **DoD:** probe PASS với dữ liệu thật. Không có bước này thì **không bắt đầu code**.

### Bước 1 — Basemap
- [ ] `map-config.ts`: `vietmapStyles = { light: tm, dark: dm }`, key từ `process.env.NEXT_PUBLIC_VIETMAP_MAP_KEY`; giữ signature `mapStyle(theme)`.
- [ ] Attribution `© VIETMAP` ở 2 renderer.
- [ ] Smoke 5 màn × light/dark × 360px + desktop.
- **DoD:** 5 màn render tile thật, một canvas sau đổi theme, attribution hiện, không lỗi hydration.

### Bước 2 — Adapter
- [ ] `modules/trip-validation/vietmap-route.ts` giữ đúng chữ ký: `toVietmapVehicle`, `requestVietmapRoute`, `getTravelRoute`, `checkTravelLeg`; `MAX_VIETMAP_RESPONSE_BYTES = 512 * 1024`.
- [ ] Giữ timeout 10s, `AbortSignal` của caller, `redirect: "error"`, `cache: "no-store"`, đọc body có giới hạn bytes, không retry, không fallback profile.
- [ ] Breaker theo §5.1.
- **DoD:** unit test đủ 9 nhánh lỗi, đơn vị, thứ tự toạ độ, không rò key, breaker TTL.

### Bước 3 — Nối provider
- [ ] `planner-routes.ts` → `createVietmapRoutesProvider`, `provider: "VIETMAP"`.
- [ ] `planner-runtime.ts` → `ENV.VIETMAP_ROUTING_API_KEY`.
- [ ] 5 importer `getTravelRoute` + 2 importer type.
- **DoD:** planner/in-trip/trip-save chạy provider mới; không file business nào import adapter trực tiếp ngoài 5 handler + `trip-save-server.ts`.

### Bước 4 — Contract & UI
- [ ] `provider: z.literal("VIETMAP").nullable()`.
- [ ] `planner-presentation.tsx` 3 chỗ → `VietMap · Thời gian di chuyển ước tính` (D6).
- [ ] `planner-service.ts:56` warning `ROUTE_ESTIMATE` → mở đầu bằng "VietMap: …", giữ nguyên phần còn lại của câu.
- **DoD:** `grep -ri stadia apps/web/src` rỗng (kể cả comment).

### Bước 5 — Xoá Stadia (D9)
- [ ] Xoá `stadia-route.ts`, `probe-stadia-routes.mjs`, `us28-stadia-browser-e2e.mjs`, `us28-offline-browser.mjs`, `us28-production-registry-browser.mjs`.
- [ ] Thêm `apps/web/scripts/probe-vietmap-routes.mjs` (chỉ routing, in bảng duration/distance; **không** in key).
- [ ] `.env.schema` + `.env.example`: xoá `STADIA_MAPS_API_KEY`, thêm 2 biến mới.
- [ ] `src/lib/provider-env.vitest.test.ts`, `scripts/test_service_with_db.mts`, `scripts/trip-planner-fixture.mts` (dùng `createStadiaRoutesProvider` để test nhánh `NOT_CONFIGURED`), `scripts/performance/{map-tile-readonly,local-readonly,preview-browser-smoke,browser-baseline}.mjs`.
- **DoD:** `grep -ri "stadia" apps/web/src apps/web/scripts scripts` rỗng.

### Bước 6 — Docs + bằng chứng
- [ ] Banner US-28 / US-29B (đã làm), ADR-17/18 → Superseded (đã làm), ADR-19 (đã làm), US-40 (đã làm).
- [ ] `technical-architecture.md:20,80,84,86,122,124`; `product-spec.md:57`; `environment-deployment.md:22,25,76-114`; `AGENTS.md:27`.
- [ ] Chạy `npm run env:generate` sau khi sửa schema.
- [ ] `npm run check-types`, `npm run test`, `npm run build`, `git diff --check`.
- [ ] Checklist tay §9 + ảnh chụp cho slide.
- [ ] Append `docs/ai-progress.md` (không sửa entry cũ).

---

## 7. Danh sách file

### MUST CHANGE / CREATE (14)

```
apps/web/src/modules/map/map-config.ts
apps/web/src/modules/map/maplibre-renderer.ts                  (attribution)
apps/web/src/modules/map/itinerary-map-renderer.ts             (attribution)
apps/web/src/modules/trip-validation/vietmap-route.ts           (MỚI)
apps/web/src/modules/trip-planner/planner-routes.ts
apps/web/src/modules/trip-planner/planner-runtime.ts
apps/web/src/modules/trip-planner/planner-contract.ts
apps/web/src/modules/trip-planner/planner-service.ts            (warning ROUTE_ESTIMATE)
apps/web/src/components/trip-planner/planner-presentation.tsx
apps/web/src/modules/trip-save/trip-save-server.ts
apps/web/src/modules/trip-save/trip-save-service.ts             (type import)
apps/web/src/modules/trip-edit/trip-edit-service.ts             (type import)
apps/web/.env.schema
apps/web/.env.example
```

### MUST CHANGE — 4 Route Handler

```
apps/web/src/app/api/trips/[id]/edits/ai/route.ts
apps/web/src/app/api/trips/[id]/edits/preview/route.ts
apps/web/src/app/api/trips/[id]/edits/apply/route.ts
apps/web/src/app/api/trips/[id]/in-trip/preview/route.ts
```

### MUST CHANGE — test (12)

```
apps/web/src/modules/map/map.test.tsx
apps/web/src/modules/map/map-location-picker.test.ts
apps/web/src/components/trip-planner/trip-theme.vitest.test.ts
apps/web/src/components/trip-planner/planner-ui.vitest.test.ts
apps/web/src/modules/trip-validation/travel-time.vitest.test.ts
apps/web/src/modules/trip-planner/planner-stadia.vitest.test.ts     → planner-vietmap.vitest.test.ts
apps/web/src/modules/trip-planner/planner-boundaries.vitest.test.ts
apps/web/src/modules/trip-planner/planner-engine.vitest.test.ts
apps/web/src/modules/trip-planner/__fixtures__/planner-fixtures.ts
apps/web/src/lib/provider-env.vitest.test.ts
apps/web/src/modules/trip-save/trip-save.vitest.test.ts            (import path)
apps/web/src/modules/in-trip/us37-test.vitest.test.ts              (comment)
```

### MUST DELETE (5)

```
apps/web/src/modules/trip-validation/stadia-route.ts
apps/web/scripts/probe-stadia-routes.mjs
apps/web/scripts/us28-stadia-browser-e2e.mjs
apps/web/scripts/us28-offline-browser.mjs
apps/web/scripts/us28-production-registry-browser.mjs
```

### MUST CREATE — script (1)

```
apps/web/scripts/probe-vietmap-routes.mjs
```

### MUST CHANGE — script phụ trợ (6)

```
apps/web/scripts/test_service_with_db.mts                        (createStadiaRoutesProvider + STADIA env)
apps/web/scripts/trip-planner-fixture.mts                        (createStadiaRoutesProvider, nhánh NOT_CONFIGURED)
scripts/performance/map-tile-readonly.mjs
scripts/performance/local-readonly.mjs
scripts/performance/preview-browser-smoke.mjs
scripts/performance/browser-baseline.mjs
```

### SHOULD CHANGE — docs (9)

```
AGENTS.md:27
docs/decisions.md                                              (xong: ADR-19 + supersede)
docs/stories/US-40-vietmap-provider-migration.md                (xong)
docs/stories/US-28-trip-planner.md                              (xong: banner)
docs/stories/US-29B-stadia-routing-travel-time.md               (xong: banner)
docs/architecture/technical-architecture.md:20,80,84,86,122,124
docs/product/product-spec.md:57
docs/implementation/environment-deployment.md:22,25,76-114
docs/ai-progress.md                                             (append sau khi code)
```

### NO CHANGE — đừng để bị "dọn" cho đẹp

```
apps/web/src/modules/map/{map-model,map-session,map-diagnostics}.ts
apps/web/src/components/map/destination-map.tsx
apps/web/src/components/trip-planner/itinerary-map.tsx
apps/web/src/app/admin/destinations/destination-location-picker.tsx
apps/web/src/components/in-trip/manual-location-picker.tsx
apps/web/src/modules/in-trip/**                                 (toàn bộ US35/36/37)
apps/web/src/modules/trip-validation/{travel-time,trip-validation,visit-constraints}.ts
apps/web/src/modules/trip-planner/{planner-engine,planner-validator,planner-candidates,planner-registry}.ts
apps/web/scripts/us28-preview-boundary-browser.mjs               (kiểm tra 403 trước provider; không phụ thuộc Stadia)
scripts/us28-*.{ts,mjs}                                          (không hard-code provider; chỉ xoá nếu owner muốn dọn cả bộ harness US-28)
packages/db/prisma/**                                           (không có provider trong DB)
docs/implementation/us28-stadia-v2-evidence/**                   (evidence lịch sử)
docs/implementation/*-evidence/**                                (giữ)
```

---

## 8. Env

`.env.schema`:

```dotenv
# Tilemap key — publishable, giới hạn referer trong VietMap Console.
# @required=false @sensitive=false
NEXT_PUBLIC_VIETMAP_MAP_KEY=

# Routing key — server-only, không bao giờ vào bundle client.
# @required=false @sensitive=true
VIETMAP_ROUTING_API_KEY=
```

Chạy `npm run env:generate` — `apps/web/src/env.ts` là file **autogenerated**, không sửa tay.

`NEXT_PUBLIC_*` được Next inline lúc build → biến phải tồn tại trong **môi trường build** của Vercel, không chỉ runtime.

Xoá `STADIA_MAPS_API_KEY` khỏi `.env.schema`, `.env.example` và khỏi Vercel project sau khi migration PASS.

---

## 9. Checklist tay (bắt buộc — thay cho browser E2E, D10)

Chạy trên local với key thật, rồi lặp lại trên production domain.

| # | Kiểm tra | Cách | Kết quả mong đợi |
| --- | --- | --- | --- |
| 1 | Tile không 401 | DevTools → Network → lọc `.pbf` | Tất cả `200`, **không có** `401` |
| 2 | 5 màn bản đồ | `/explore?view=map`, `/destinations/<id>`, `/admin/destinations`, itinerary map, in-trip picker | Tile + marker hiện đúng |
| 3 | Light/dark | Toggle theme trên từng màn | Đổi style, **một** canvas |
| 4 | Attribution | Quan sát góc bản đồ | `© VIETMAP` hiển thị, không tràn ở 360px |
| 5 | Fallback | Chặn `maps.vietmap.vn` bằng DevTools | Hiện "Bản đồ chưa khả dụng" + danh sách vẫn dùng được |
| 6 | Planner CAR | Form → proposal | Leg `VERIFIED`, có `provider: "VIETMAP"` |
| 7 | Planner MOTORCYCLE | Đổi transport → proposal | Leg `VERIFIED`, duration khác CAR |
| 8 | Credit | Xem phần tổng quan ngày | `VietMap · Thời gian di chuyển ước tính` |
| 9 | Save | Xác nhận lưu | `SUCCESS`, detail mở được |
| 10 | In-trip | Preview → apply | Không lỗi, không lộ key trong response |
| 11 | Không lộ routing key | DevTools → Sources + Network response | Không tìm thấy giá trị routing key |

---

## 10. Rủi ro

| Rủi ro | Mức | Cách chặn |
| --- | --- | --- |
| Key thiếu/sai referer → map trắng (style 200, tile 401) | Cao | Checklist #1 + #5; whitelist trước khi demo |
| Docs `points_encoded` mâu thuẫn thứ tự toạ độ | Cao | Test 3 cặp Hà Giang thật; assert `[lng,lat]` |
| `OVER_DAILY_LIMIT` (HTTP 200, không path) | TB | Map `UNAVAILABLE` + breaker + log `code` |
| Breaker chỉ đúng 1 instance | TB | Đã chấp nhận; ghi rõ trong ADR-19/US-40 |
| Hết free tier trước ngày bảo vệ | TB | Xin key giáo dục; ghi ngày hết hạn; chuẩn bị ảnh chụp bản đồ cho slide |
| Quên `provider` literal → mọi leg `INVALID_RESPONSE` | TB | Test provider + checklist #6/#7 |
| Sửa `map.test.tsx:115` cho xanh mà mất invariant | TB | ADR-19 + assert mới về routing key |
| Route phụ thuộc giờ gọi (D5) | TB | Ghi known limitation; không hứa tất định |
| Rename file làm gãy 2 type-import | Thấp | §2.2 |
| Số thập phân format `vi-VN` | Thấp | Template số thô |

---

## 11. Phần dán vào báo cáo / slide (D17)

**Trước → Sau**

```
TRƯỚC                                    SAU
MapLibre ─ Stadia Alidade style          MapLibre ─ VietMap vector tile (tm/dm)
  └ domain auth, không key                 └ publishable key + referer whitelist
                                          + attribution © VIETMAP

Server ─ Stadia Standard Routing          Server ─ VietMap Route v4
  auto / motorcycle                          car / motorcycle
  POST + header auth                          GET + apikey (query)
  polyline6, km                               polyline5, mét + mili-giây
  provider "STADIA_MAPS"                      provider "VIETMAP"
```

**Ba câu giải thích khi hội đồng hỏi "vì sao đổi provider"**

1. **Dữ liệu đúng đối tượng:** VietMap xây dựng dữ liệu đường bộ Việt Nam tới cấp thôn/ấp và có profile `motorcycle` riêng — Stadia dựa trên dữ liệu OpenStreetMap toàn cầu, đường đèo Hà Giang và quy định xe máy không được mô hình hoá đầy đủ.
2. **Sửa một lỗi thật:** bản đồ Stadia ở môi trường production trả tile `401` do ràng buộc domain của nhà cung cấp; sau khi đổi, tile trả `200` và có bằng chứng.
3. **Kiến trúc không đổi:** chỉ thay adapter phía sau `getTravelRoute()`; Constraint Validator, luồng In-trip và cơ chế lưu chuyến đi giữ nguyên — chứng minh thiết kế tách provider có tác dụng.

---

## 12. Prompt cuối để gửi Claude

> Đọc hết file trước khi sửa. Mục tiêu: **bỏ hoàn toàn Stadia Maps**, thay bằng VietMap. Giữ MapLibre GL. Không đổi business logic.
>
> Nguồn bắt buộc đọc: `docs/stories/US-40-vietmap-provider-migration.md`, file này (nhật ký D1–D21 là quyết định đã chốt, không mở lại), `docs/decisions.md` ADR-19, `AGENTS.md`.
>
> Ràng buộc cứng:
> 1. Không đổi shape `TravelRoute` / `travelLegSchema`, không thêm reason code, không đổi Prisma schema.
> 2. `in-trip-validation`, `trip-validation`, `planner-engine/validator/candidates/registry`, US-35/36/37 không được sửa. Ngoại lệ duy nhất ở tầng business: một chuỗi warning trong `planner-service.ts:56` (xem điều 15).
> 3. Bản đồ: chỉ `map-config.ts` (style `tm`/`dm`) + attribution `© VIETMAP` ở hai renderer. Không đổi marker/popup/picker/session/model.
> 4. Routing: file mới `trip-validation/vietmap-route.ts`, đúng chữ ký. Business layer không import trực tiếp.
> 5. Xoá hẳn `stadia-route.ts` + 4 script Stadia. Không fallback, không dual-provider, không `STADIA_MAPS` trong enum/contract/test/fixture.
> 6. Key: `NEXT_PUBLIC_VIETMAP_MAP_KEY` (publishable, referer) và `VIETMAP_ROUTING_API_KEY` (server-only). Routing key không vào bundle/log/response. Thay assert `map.test.tsx:115` bằng invariant "routing key không có trong client".
> 7. `paths[0].time` = ms → `durationSeconds = time/1000`; `paths[0].distance` = mét (không ×1000). `CAR → car`, `MOTORCYCLE → motorcycle`.
> 8. HTTP 200 + `code`: `ZERO_RESULTS → NO_ROUTE`, `OVER_DAILY_LIMIT → UNAVAILABLE`, `INVALID_REQUEST`/`MAX_POINTS_EXCEED`/JSON sai → `INVALID_RESPONSE`, `ERROR_UNKNOWN`/non-2xx → `UNAVAILABLE`, timeout → `TIMEOUT`, thiếu key → `NOT_CONFIGURED`. Fail-closed.
> 9. `points_encoded=false` **không tin thứ tự toạ độ**; chuẩn hoá `[lng,lat]`, validate bằng `isValidMapCoordinate`. Decoder polyline6 hiện tại không dùng lại được.
> 10. Breaker trong adapter: flag in-process, TTL 15 phút, chỉ trip khi `OVER_DAILY_LIMIT`, trả `UNAVAILABLE` ngay, không cache route, `ZERO_RESULTS` không trip, clock tiêm được để test.
> 11. Giữ 27 cặp / 3 song song / 10s; không thêm cap thứ hai.
> 12. Giữ timeout 10s, `redirect:"error"`, `cache:"no-store"`, `MAX_*_RESPONSE_BYTES`; không retry; không log URL.
> 13. Số trong query dùng template thô, không `toLocaleString`.
> 14. Cập nhật đủ 12 test + 1 script mới + 6 script phụ trợ + 9 docs (4 docs còn lại: technical-architecture, product-spec, environment-deployment, ai-progress); append `ai-progress.md` entry mới, không sửa entry cũ.
> 15. Chuỗi "Stadia Maps" xuất hiện ở **4** chỗ phía người dùng, không phải 3: `planner-presentation.tsx:52,67,75` và `planner-service.ts:56` (warning `ROUTE_ESTIMATE`). Sửa cả 4. Import `../trip-validation/stadia-route` nằm trong `trip-save.vitest.test.ts:3` và `travel-time.vitest.test.ts:5` — không được bỏ sót.
>
> Trước khi code: xuất bảng MUST CHANGE / MUST DELETE / NO CHANGE + danh sách test phải update, đối chiếu §7. Chờ duyệt rồi mới sửa. Làm trên worktree riêng, 3 commit, không push.

---

## 13. Bảng bằng chứng (điền khi IMPLEMENTED — điều kiện để ACCEPTED, D18)

| Hạng mục | Kết quả | Ghi chú |
| --- | --- | --- |
| `npm run check-types` | NOT_RUN | |
| `npm run test` | NOT_RUN | |
| `npm run build` | NOT_RUN | |
| `git diff --check` | NOT_RUN | |
| `probe-vietmap-routes.mjs` (routing thật) | NOT_RUN | |
| Checklist §9 #1–#11 (local) | NOT_RUN | |
| Checklist §9 #1–#11 (production) | NOT_RUN | |
| `grep -ri stadia` sạch | NOT_RUN | |

Không được ghi PASS khi chưa chạy. Mục nào không chạy được thì ghi `NOT_RUN` + lý do.

---

## 14. Nguồn đã kiểm chứng

- Tổng quan & hạn mức: `https://maps.vietmap.vn/docs/vi/map-api/overview/`
- Tilemap/style: `https://maps.vietmap.vn/docs/vi/map-api/tilemap/`
- Route v4: `https://maps.vietmap.vn/docs/vi/map-api/route-version/route-v4/`
- Agent doc chính thức (đưa thẳng cho AI agent thay vì crawl docs):
  - `https://maps.vietmap.vn/docs/assets/agents/routing.txt` (7 KB)
  - `https://maps.vietmap.vn/docs/assets/agents/map-display.txt` (10 KB)
- Probe trực tiếp 2026-10-23: style `lm` trả 200 với key sai và nhúng key vào tile URL; tile `.pbf` trả 401 không key/key sai; `sources` không có `attribution`; `maxzoom` 15.
