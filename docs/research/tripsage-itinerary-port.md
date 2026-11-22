# Nghiên cứu: port luồng lập hành trình AI của tripsage-ai vào KLTN

Trạng thái: nghiên cứu (chỉ đọc), chưa có quyết định được duyệt, không phải ủy quyền code. Ngày: 2026-11-12.
Nguồn: code thật hai repo. KLTN = `d:\Khoa_luan_tot_nghiep\KLTN`; tripsage = `D:\Khoa_luan_tot_nghiep\tripsage_ai\tripsage-ai` (viết tắt `TS:`; đường dẫn dưới `src/`). Đường dẫn KLTN dưới `apps/web/src/` (viết tắt `K:`). `docs/research/` chưa tồn tại; tạo mới vì `docs/` không có thư mục ghi chú nghiên cứu (thiết kế nằm ở `docs/implementation/`).

## 0. Kết luận cốt lõi

1. "Logic lập hành trình" của tripsage rất mỏng: một LLM tool-loop (AI SDK v7 `ToolLoopAgent`) gọi web search / Google Places, rồi `createTravelPlan` ghi JSON tự do vào **Redis** (TTL), `saveTravelPlan` chỉ đổi `status` trong Redis (TS:ai/tools/server/planning.ts:214-289, 438-470; TS:ai/agents/itinerary-agent.ts:65-146). Không có scheduler, không có validator, không có tính thời gian di chuyển, không có kiểm tra giờ mở cửa, không ghi DB quan hệ.
2. KLTN đã có hệ thống trưởng thành, ràng buộc chặt: AI chỉ hiểu nhu cầu/chọn id điểm đến, còn scheduler (K:modules/trip-planner/planner-engine.ts:29-93), Constraint Validator (K:modules/trip-planner/planner-validator.ts:6-52, K:modules/trip-validation/trip-validation.ts), routing Stadia (K:modules/trip-validation/stadia-route.ts), Save idempotent (K:modules/trip-save/trip-save-service.ts) là deterministic và tách khỏi AI.
3. Vì vậy "thay thế" luồng KLTN bằng luồng tripsage là **giảm chức năng và vi phạm bất biến sản phẩm** (xem mục 3). Cách khả thi duy nhất không vi phạm: **port có chọn lọc các mẫu (pattern) của tripsage vào lớp AI/đề xuất**, giữ nguyên scheduler + Validator + Save + idempotency của KLTN. Không port: Supabase, Redis plan store, Google Places/Routes, Amadeus/Stripe, memory pgvector, BYOK.
4. Cần người dùng chốt phạm vi "thay thế" trước khi code (mục 7). Đề xuất mặc định: phương án B (mục 4).

## 1. Bản đồ luồng hiện tại của KLTN

Hai đường vào, chung lõi:

| Tầng | Thành phần (file) | Ghi chú |
|---|---|---|
| UI chat | `K:app/assistant/page.tsx`, popup nổi; `K:components/trip-planner/*` (trip-planner-screen, itinerary-map) | Chat-first, hỏi từng nhu cầu, recap rồi mới "Tạo hành trình" (docs/stories/ASSISTANT-CHAT-FIRST-PLANNING.md) |
| UI form | `K:app/trips/new/*` (trip-requirement-form, review-screen, sentence-builder), `K:components/trip-origin/*` | US-24..27, origin/round-trip |
| Route Handler (mỏng) | `K:app/api/ai/planning/route.ts:1-6` -> `planningResponse`; `K:app/api/trip-proposals/route.ts` -> `plannerResponse`; `K:app/api/trips/route.ts:16-18` (Save) | Handler chỉ gọi module |
| Auth/boundary | `K:modules/assistant-planning/planning-http.ts` (requireTraveler, same-origin, JSON, `Idempotency-Key` regex `^[a-zA-Z0-9_-]{8,128}$`, body <=1 MiB, `private, no-store`, lỗi ẩn chi tiết) | Server-owned authorization |
| Hội thoại | `K:modules/assistant-agent-v2/*` (http-service, travel-planning-session, planning-response, planning-replanning), `K:modules/assistant-planning/*` (planning-ai, engine, repository, dialogue) | Capsule phiên mã hóa + head CAS (`assistant-v2-session.prisma`), workspace `assistant_planning_workspace` |
| AI (chỉ đề xuất/ngôn ngữ) | `K:modules/assistant-planning/planning-ai.ts` (model pinned riêng), `K:modules/ai/qa-json-provider.ts:85` (fetch thẳng `api.openai.com/v1/chat/completions`, `json_schema` strict, `store:false`, giới hạn bytes/token), `planning-reply.ts` (chỉ ngôn ngữ) | Không dùng SDK `ai`; không streaming token |
| Lập lịch | `K:modules/trip-planner/planner-service.ts:27-89` (propose: idempotent in-memory 120s, rate 4/phút, 3 đồng thời, recheck DB), `planner-engine.ts` (chọn ngày theo pace, cửa sổ 08:00-18:00, giờ mở cửa), `planner-routes.ts`, `planner-day-balance.ts` | Chỉ dùng điểm đến VISIBLE trong DB (`destination-eligibility.ts`) |
| Journey/origin | `K:modules/trip-origin/*` (journey-planner, vietnam-coverage, origin-search Stadia) | Khứ hồi, `journeySnapshot` |
| Constraint Validator | `K:modules/trip-validation/trip-validation.ts`, `visit-constraints.ts`, `travel-time.ts`; planner-validator.ts:6-52 | 3 trạng thái PASS/VIOLATION/INSUFFICIENT_DATA; thiếu dữ liệu != PASS (planner-validator.ts:27,31,37,49,50) |
| Routing | `K:modules/trip-validation/stadia-route.ts:16,52,60-61,78` (auto/motorcycle, <=10s, key lấy từ runtime-config server-side, giới hạn 512KB) | Key không ra bundle/log/response |
| Save | `K:modules/trip-save/trip-save-service.ts` (requireTraveler :102/:119, `executeIdempotentWrite`, đọc lại DB trong transaction, route mới) | SUCCESS/FAILED/UNKNOWN: `K:server/http/idempotency.ts:237` |
| Sửa/AI edit | `K:modules/trip-edit/*` (~3.6k dòng), in-trip: `K:modules/in-trip`, `assistant-agent-v2/in-trip-*` | Ngoài phạm vi "lập hành trình" nhưng phụ thuộc cùng contract |
| DB (Prisma, migration-only) | `packages/db/prisma/schema/trip.prisma` (Trip, ItineraryDay, ItineraryVisit, journeySnapshot), `assistant-planning.prisma`, `assistant-v2-session.prisma`, `idempotency.prisma`, `origin-search.prisma`; 37 migration đến `20261104130000_trip_journey_snapshot` | Migration 2026-11-04 mới chỉ áp Development, chưa Production (docs/ai-progress.md) |

Quy mô KLTN (không tính test): assistant-agent-v2 ~29 file, trip-requirement ~2.7k, trip-edit ~3.6k, trip-origin 26 file, preference-extraction ~2.1k. Đây không phải thứ "thay bằng một file agent".

## 2. Bản đồ logic cần port của tripsage

| Lớp | Thực tế trong tripsage | File |
|---|---|---|
| Stack | Next 16.2.10, React 19, TS 6, AI SDK `ai@7.0.28`, Zod 4, Zustand, React Query, Supabase SSR, Upstash Redis/Ratelimit/QStash, OTel, pnpm, Biome, Vitest. License MIT. Không i18n | TS:package.json, README.md:312-315 |
| Entry A (agent chuyên biệt) | `POST /api/agents/itineraries` -> `createAgentRoute` (auth, rate limit `agents:itineraries`, Zod, resolve provider/model theo user, `maxDuration=60`) | TS:app/api/agents/itineraries/route.ts:9-15; TS:lib/api/factory.ts:735-791 |
| Entry B (chat tổng quát) | `POST /api/chat` -> `handleChat`: ensure session, history, memory hydration, `streamText` + toàn bộ `toolRegistry` (30 tool), lưu message + tool call vào Supabase | TS:app/api/chat/_handler.ts:1000-1400; TS:ai/tools/index.ts:85-117 |
| Agent | `ToolLoopAgent`, repairToolCall, stepLimit>=15, 3 pha theo `prepareStep` (40% research / 33% plan / 27% save) | TS:ai/agents/itinerary-agent.ts:96-139; TS:ai/agents/agent-factory.ts |
| Prompt | 1 câu hệ thống ngắn, tham số đưa vào user message, yêu cầu JSON `itin.v1` | TS:prompts/agents.ts:30-37; itinerary-agent.ts:77 |
| Schema kết quả | `itineraryPlanResultSchema` (days[] activities: name/time/location, sources[]); input: destination, durationDays, interests, partySize, travelDates, budgetPerDay | TS:domain/schemas/agents.ts:98-146 |
| Lưu plan nháp | Redis `travel_plan:{id}` (planSchema: destinations[], start/end date, components{flights,activities,...} loose records), TTL nháp/final, lock phiên Redis 15s | TS:ai/tools/server/planning.ts:37-65, 214-289; planning.schema.ts:17-36 |
| Lưu trip thật | Bảng `trips`, `itinerary_items` (item_type, start_time/end_time timestamptz, location text, price, metadata), `trip_collaborators`, RLS; UI sửa tay bằng server actions | TS:supabase/migrations/20260120000000_base_schema.sql:259-349; TS:lib/trips/actions/itinerary.ts |
| Nguồn dữ liệu | Google Places/Routes/Geocode/Timezone, Firecrawl web search/crawl, OpenWeather, Amadeus, Duffel, Stripe | TS:lib/google/client.ts:102-358 |
| Streaming | AI SDK UI message stream (`createUIMessageStream`, `data-status` tạm thời), persist assistant message + tool call theo bước | TS:app/api/chat/_handler.ts:1391-1500 |
| Bộ nhớ | `memories.sessions/turns/turn_embeddings` (pgvector), `handleMemoryIntent` | TS:lib/memory/*, _handler.ts:1171-1195 |
| Idempotency | Redis, mặc định **fail-open** (`IDEMPOTENCY_FAIL_OPEN` default true) | TS:lib/env/server-flags.ts:36 |
| Env | OPENAI/ANTHROPIC/XAI/TOGETHER/OPENROUTER keys, Supabase URL/keys/JWT, Upstash, Firecrawl, Google Maps, Stripe, Resend, Amadeus... | TS:.env.example |

Điểm thiếu đáng chú ý so với yêu cầu KLTN: không validator, không routing thật, không ràng buộc điểm đến cố định, `saveTravelPlan(finalize)` báo thành công khi mới ghi Redis (planning.ts:462), kết quả itinerary là text tự do do LLM sinh.

Phần đáng port (pattern, không phải code nguyên khối):
- P1. Pha công cụ theo bước (`prepareStep` + `activeTools`) và `repairToolCall` để sửa tool-call sai schema.
- P2. Tách "request params là dữ liệu, không phải chỉ dẫn" (prompt injection hygiene) - KLTN có tương đương, cần đối chiếu.
- P3. Streaming UI message + trạng thái bước (`data-status`) cho UX chat - KLTN hiện không stream.
- P4. `stepLimit`, timeout theo bước/tổng, token budget (`buildTokenBudget`, _handler.ts:620).
- P5. Schema `itin.v1` (day/activity/sources) làm hình dạng hiển thị - nhưng KLTN đã có `plannerResultSchema` giàu hơn.

## 3. Ràng buộc và xung đột khi thay thế

Phân loại: BLOCKER = không thể làm mà vẫn tuân thủ bất biến; QĐ = cần quyết định của chủ dự án; DỄ = xử lý kỹ thuật được.

| # | Hạng mục | Tripsage | KLTN yêu cầu | Phân loại | Hướng xử lý |
|---|---|---|---|---|---|
| 1 | Constraint Validator tách khỏi AI | Không có; AI tự sinh lịch và tự "finalize" | AI đề xuất, Validator deterministic quyết định; thiếu dữ liệu != PASS (AGENTS.md; planner-validator.ts:27-50) | BLOCKER nếu thay nguyên | Giữ nguyên Validator; mọi output của agent tripsage phải đi qua `schedulePlannerDays`+`validatePlannerDays` |
| 2 | Chọn điểm đến | Web search/Google Places toàn cầu | Chỉ điểm đến VISIBLE trong DB Hà Giang (planner-engine.ts:36; trip-save-service.ts:37-38) | BLOCKER nếu thay nguyên | Chỉ cho agent công cụ truy vấn DB nội bộ (candidate inventory); cấm web search chọn điểm |
| 3 | SUCCESS/FAILED/UNKNOWN + idempotency | Redis fail-open; `finalize` báo thành công không qua DB | Không báo SUCCESS trước khi DB xác nhận; UNKNOWN retry cùng key+payload (idempotency.ts:237) | BLOCKER nếu thay Save | Không port `saveTravelPlan`; giữ `POST /api/trips` + `executeIdempotentWrite` |
| 4 | Routing/thời gian di chuyển | Google Routes/distanceMatrix | Stadia Standard Routing, auto/motorcycle, <=10s, timeout -> INSUFFICIENT_DATA (stadia-route.ts:60-61) | BLOCKER nếu thay nguyên | Không port Google; giữ Stadia server-only |
| 5 | Secrets server-side | Google/OpenAI key qua `server-only`, có BYOK vault | OpenAI + Stadia chỉ server, không vào bundle/log/response | DỄ | Không port `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY`, BYOK; dùng `runtimeSetting` hiện có |
| 6 | Prisma migration, không `db:push` | Supabase SQL migration + RLS | Prisma migrate (ADR-05) | QĐ/DỄ | Không import bảng Supabase; nếu cần bảng mới (vd. nhật ký tool-call) tạo migration Prisma mới, áp Dev trước |
| 7 | Route Handler mỏng | Có `createAgentRoute` factory (khá mỏng) | Handler chỉ parse/auth/gọi module | DỄ | Port logic vào `K:modules/...`; route chỉ gọi |
| 8 | Ownership/authorization server | Supabase RLS + `auth.getUser()` trong tool | `requireTraveler` + kiểm tra owner trong service; ADMIN kế thừa Traveler (RBAC V2) | DỄ | Dùng `requireTraveler`; không port RLS/Supabase auth |
| 9 | MVP scope/story | Đa miền: chuyến bay, khách sạn, thanh toán, calendar | Hà Giang, ~30 điểm, xe máy/ô tô; story hiện hành (US-28/29, chat-first, origin) | BLOCKER cho phần ngoài scope | Chỉ port phần itinerary; bỏ flights/accommodation/payments. Cần story mới được duyệt |
| 10 | Stack | pnpm, Biome, Supabase, Upstash, `ai@7` | npm workspaces + Turborepo (ADR-03), Prisma/Neon, Better Auth, không Redis, không SDK `ai` | QĐ | Thêm `ai` + `@ai-sdk/openai` vào `apps/web` cần ADR; thay Redis lock bằng DB/in-memory hiện có |
| 11 | Next.js version | Next 16.2.10 | `^16.3.4`; `apps/web/AGENTS.md` bắt buộc đọc `node_modules/next/dist/docs/` trước khi code | DỄ | Đọc docs Next cài sẵn, không copy pattern route/proxy từ tripsage mù |
| 12 | Mô hình dữ liệu | `trips` + `itinerary_items` linh hoạt (timestamptz, location text) | `Trip/ItineraryDay/ItineraryVisit` tham chiếu `destinationId`, startMinute, duration, order | BLOCKER nếu đổi | Giữ schema KLTN; ánh xạ output agent -> `TripProposal`/PlannerResult |
| 13 | i18n tiếng Việt | Không i18n, prompt tiếng Anh | Toàn bộ UI/thông báo/lỗi tiếng Việt | DỄ | Dịch/viết lại prompt tiếng Việt; không port chuỗi tiếng Anh |
| 14 | Tính xác định/kiểm chứng | `temperature 0.3`, kết quả không tái lập | Cùng input+dữ liệu -> cùng kết quả (product-spec Validator) | DỄ | Giữ phần xác định ngoài agent |
| 15 | Streaming | Có | KLTN trả JSON một lần, capsule phiên, idempotent theo lượt | QĐ | Streaming chỉ cho phần ngôn ngữ; kết quả cuối vẫn đi qua contract hiện có |
| 16 | Bộ nhớ dài hạn (pgvector memories) | Có, lưu PII chưa scrub | KLTN có luật retention/tombstone QA, quyền riêng tư | QĐ | Không port trong đợt này |
| 17 | License | MIT (Copyright dòng đầu ghi Supabase, Inc.) | Dự án luận văn | DỄ | Giữ header MIT + ghi nguồn khi copy đoạn code; kiểm tra lại nếu copy trực tiếp |
| 18 | Hạ tầng đang dở | - | Migration origin/journey chưa lên Production; full Vitest chưa xanh (ai-progress 2026-11-04) | QĐ/rủi ro | Không bắt đầu thay luồng khi nền chưa ổn định; đo baseline trước |
| 19 | Test hiện có | Vitest 4 project | Nhiều suite khóa hành vi planning (>=1084 test origin+assistant) | DỄ/rủi ro | Mọi thay đổi chạy lại; thay thế mất test = mất bằng chứng nghiệm thu |

## 4. Các phương án thay thế

- A. Thay hoàn toàn bằng luồng tripsage: **không khuyến nghị** (vi phạm #1-#4, #9, #12).
- B. Lắp "agentic proposal layer" kiểu tripsage vào KLTN (khuyến nghị): thay bước "AI chọn điểm đến/ngày" bằng agent nhiều bước (pha: tra cứu candidate nội bộ -> đề xuất -> tự sửa lỗi) nhưng công cụ chỉ đọc DB KLTN + Stadia thông qua service sẵn có; đầu ra luôn đi vào scheduler/Validator/Save hiện có.
- C. Chỉ port UX streaming + trạng thái bước vào chat hiện có, không đổi lõi (rủi ro thấp nhất).

## 5. Kế hoạch tích hợp theo pha (phương án B; "lắp trước, fix sau")

Mọi pha: một story mới (vd. `US-xx-agentic-itinerary-proposal`) được chủ dự án duyệt trước; không sửa invariant.

| Pha | Việc | Mapping nguồn -> đích | Migration | File thay/xóa | Kiểm thử / DoD | Rollback |
|---|---|---|---|---|---|---|
| 0 | Chốt phạm vi, ADR cho thêm `ai`/`@ai-sdk/openai`, baseline test (chạy `npm run test`, `check-types`, build) và ghi lại vùng đã đỏ | docs: decisions.md, story mới | Không | Không | Báo cáo baseline; `git diff --check` | Không cần |
| 1 | Hợp đồng agent: `ProposalAgentResult` (danh sách `destinationId` + ngày + lý do) validate bằng Zod; tool nội bộ chỉ đọc: `listEligibleCandidates` (dùng `planner-candidates`/`destination-eligibility`), `getCandidateDetails`, `getRouteEstimate` (bọc `stadia-route`) | TS:ai/lib/tool-factory.ts, ai/tools/server/{places,maps}.ts (chỉ pattern) -> `K:modules/trip-proposal-agent/*` mới | Không | Không | Unit test: tool từ chối id không VISIBLE; thiếu dữ liệu trả INSUFFICIENT_DATA, không đoán | Xóa module mới |
| 2 | Vòng agent nhiều pha + repair + step/timeout/token budget, dùng model OpenAI cố định riêng cho planning (như planning-ai.ts) | TS:ai/agents/{agent-factory,itinerary-agent}.ts (P1, P4), prompts/agents.ts (P2) -> `K:modules/trip-proposal-agent/agent-runtime.ts`; prompt tiếng Việt | Không (có thể chọn tự gọi `fetch` OpenAI như `qa-json-provider.ts:85` thay vì SDK) | Thay nội dung `planning-ai.ts` phần chọn điểm (giữ chữ ký) | Test mô phỏng LLM (fetcher stub): kết quả luôn qua `selectPlannerDays`/Validator; tool-call sai bị repair hoặc bỏ | Feature flag qua `runtime-config`, tắt -> về selector cũ |
| 3 | Nối vào pipeline: output agent thay `orderPlannerCandidates`/`selectPlannerDays` đầu vào trong `planner-service.propose`; giữ `schedulePlannerDays` + `validatePlannerDays` + `ensureCurrent` | `K:modules/trip-planner/planner-service.ts:46-55` | Không | Sửa `planner-engine.ts` chọn ngày (chỉ khi cần) | Regression: suite planner, origin, assistant V2 (>=1084 test); Validator không được yếu đi | Revert commit; flag |
| 4 | Streaming/trạng thái bước cho chat (P3) - tuỳ chọn | TS:app/api/chat/_handler.ts:1391-1500 (`data-status`) -> route `ai/planning` giữ envelope hiện tại; stream chỉ phần ngôn ngữ/tiến độ | Không | Thêm client component trạng thái | Mobile 360px, a11y, UNKNOWN vẫn khóa & retry cùng key | Tắt qua flag |
| 5 | Fix bổ sung: tinh chỉnh prompt tiếng Việt, đo chất lượng (so sánh bộ test hiện có `assistant-trip-planning-evaluation.json`), tối ưu chi phí/latency | docs/implementation | Chỉ khi cần bảng log tool-call: migration Prisma mới, áp Development trước | Xóa selector cũ chỉ khi pha 3 ổn định | Evidence vào `docs/ai-progress.md`; story status; secret scan | Giữ selector cũ 1 release |

DoD chung (AGENTS.md): rà acceptance story, chạy `check-types`, build, test liên quan, kiểm tra migration state nếu đụng DB, `git diff --check`, cập nhật story + `docs/ai-progress.md`, kiểm tra không lộ secret/không có thay đổi lạ. Không merge/push nếu người dùng chưa yêu cầu.

## 6. Rủi ro chính

- Hồi quy bất biến: agent bỏ qua Validator hoặc chọn điểm ngoài DB (giảm bằng thiết kế pha 1 + test).
- Chi phí/latency: tool-loop nhiều bước so với 1 lần gọi JSON hiện tại; ràng buộc `maxDuration=120` ở route planning (K:app/api/ai/planning/route.ts:5) và ngưỡng 10s/leg Stadia.
- Tái lập: Validator xác định nhưng đề xuất agent không; nghiệm thu RQ2 cần log đủ để so sánh.
- Nền chưa ổn: migration production chưa áp, Vitest toàn bộ chưa xanh.
- Phụ thuộc mới (`ai@7`, provider) và drift Next 16.2 vs 16.3.
- Prompt injection qua nội dung điểm đến/RAG/câu người dùng: chỉ đưa dữ liệu, không đưa chỉ dẫn.

## 7. Câu hỏi cần grill

| # | Câu hỏi | Đề xuất mặc định | Lý do |
|---|---|---|---|
| 1 | "Thay thế" nghĩa là gì: A (thay hoàn toàn), B (thay lớp đề xuất AI), hay C (chỉ port UX streaming)? | B | A vi phạm Validator/DB/scope; C quá nhỏ so với mục tiêu; B tận dụng logic tripsage mà giữ bất biến |
| 2 | Có chấp nhận tripsage chỉ cung cấp pattern (agent nhiều pha, repair, streaming), còn tool dữ liệu phải là nội bộ KLTN (DB + Stadia), bỏ Google Places/Firecrawl/Amadeus? | Có | Bất biến "chỉ điểm đến eligible trong DB" và routing Stadia |
| 3 | Có được phép viết story mới + ADR (thêm `ai`/`@ai-sdk/openai`, hoặc tự gọi `fetch` OpenAI như hiện tại)? | Dùng `fetch` + JSON schema như `qa-json-provider.ts` ở pha 1-3, cân nhắc SDK ở pha 4 | Giảm phụ thuộc, giữ giới hạn byte/timeout đã nghiệm thu |
| 4 | Giữ hay bỏ luồng form planner (`/trips/new`) và Assistant V2 hiện có khi luồng mới sẵn sàng? | Giữ cả hai, luồng mới đứng sau feature flag | Chủ dự án đã nghiệm thu form + chat-first; rollback dễ |
| 5 | Streaming token có bắt buộc không, trong khi KLTN hiện trả JSON một lần và khóa theo idempotency/capsule? | Chỉ stream tiến độ/ngôn ngữ, kết quả cuối vẫn là contract cũ | Tránh phá cơ chế UNKNOWN/retry |
| 6 | Có port bộ nhớ dài hạn/pgvector memory và `trip_collaborators`? | Không | Ngoài story; KLTN có Companion riêng và luật retention QA |
| 7 | Có cần bảng mới (log tool-call, nhật ký agent) phục vụ đánh giá RQ2? | Chưa; dùng log chẩn đoán hiện có, nếu cần thì migration Prisma riêng ở pha 5, áp Development trước | Tránh thêm schema khi chưa chứng minh cần |
| 8 | Ngôn ngữ prompt/đầu ra agent: toàn tiếng Việt, tên điểm đến theo DB? | Có | Yêu cầu i18n; tên điểm đến là dữ liệu nguồn |
| 9 | License: có copy code trực tiếp từ tripsage (MIT, header Supabase) hay chỉ viết lại theo pattern? | Viết lại theo pattern, ghi nguồn trong ADR | Tránh nghĩa vụ giữ bản quyền và code ngoài convention KLTN |
| 10 | Có chặn bắt đầu cho tới khi nền ổn định (áp migration origin/journey lên Production, baseline Vitest)? | Chặn đến khi có baseline được ghi nhận | Tránh gán lỗi nền cho thay đổi mới (ai-progress 2026-11-04) |
| 11 | Giới hạn chi phí/latency chấp nhận được cho một lần lập (số bước agent, timeout tổng)? | <=8 bước, tổng <=60s, trần token đầu ra giữ như planning hiện tại | Giữ trong `maxDuration` 120s và ngân sách route Stadia 10s |
| 12 | Tiêu chí "xong" của việc thay thế: so sánh định lượng với selector cũ (tỉ lệ PASS Validator, số hành trình lưu được) hay chỉ chạy được? | So sánh định lượng trên bộ evaluation sẵn có | Hỗ trợ RQ2 và tránh hồi quy chất lượng |

## 8. Chưa xác minh

- Không chạy ứng dụng hay test của hai repo (chỉ đọc code); số liệu test/ngày lấy từ `docs/ai-progress.md`.
- Chưa đọc chi tiết `assistant-agent-v2/planning-response.ts`, `planning-replanning.ts`, `trip-requirement/*`: cần đọc trước khi chốt điểm cắm ở pha 3.
- Chưa rà toàn bộ `docs/specs/active/0103-spec-chat-and-agents.md` của tripsage và phần pgvector/memory.

---

## Quyết định tạm của chủ dự án (2026-11-14) — CHƯA là ADR

- Hướng: lắp toàn bộ khối chat của tripsage-ai (UI chat, route chat, agent) để thay luồng lập lịch trình hiện tại. Thay vì chỉ thay lớp đề xuất (phương án B), đây gần với phương án A.
- Các ràng buộc/xung đột bên trên **được ghi nhận và hoãn xử lý**. Chúng vẫn còn hiệu lực theo AGENTS.md cho tới khi có quyết định/ADR được duyệt.
- Các bất biến đang bị đe dọa và phải xử lý sau, không được coi là đã giải quyết:
  1. Constraint Validator tách khỏi AI (thiếu dữ liệu validation ≠ pass).
  2. Chỉ dùng điểm đến VISIBLE trong DB Hà Giang; routing Stadia, không dùng Google.
  3. SUCCESS/FAILED/UNKNOWN + idempotency khi Save; chỉ báo thành công sau khi DB xác nhận.
  4. Dữ liệu lưu là Trip/ItineraryVisit tham chiếu `destinationId` (qua Prisma migration, không `db:push`).
  5. Secrets (OpenAI, Stadia) chỉ ở server; Route Handler mỏng; ownership kiểm trên server.
  6. Khác biệt stack: Supabase/Redis/pnpm so với Prisma/Neon/npm; i18n tiếng Việt; license MIT (ghi nguồn).

- (2026-11-14) Chủ dự án muốn dùng Google thay Stadia cho routing/địa điểm. **Xung đột chưa được duyệt** với bất biến routing Stadia và AGENTS.md (credential routing chỉ server-side). Hoãn xử lý; cần ADR riêng. Phạm vi (chỉ routing hay cả Places) đang chờ làm rõ.

---

## 9. Bổ sung đọc code (2026-11-14, chỉ đọc) — điểm cắm và khối chat tripsage

Phạm vi mục này: kiểm chứng phần "Chưa xác minh" ở mục 8 cho `planning-response.ts`, `planning-replanning.ts`, `trip-requirement/*` và đọc khối chat của tripsage. Chưa chạy test/app. Đường dẫn KLTN dưới `apps/web/src/` (`K:`), tripsage dưới `src/` (`TS:`). Vẫn là nghiên cứu, không phải ADR/ủy quyền code.

### 9.1 File KLTN bị thay / được gọi từ chat mới, kèm điểm cắm

Đã kiểm chứng: `planning-response.ts` và `planning-replanning.ts` KHÔNG tự lập lịch. Cả hai chỉ là lớp ngôn ngữ/chỉnh sửa gắn vào session V2; lõi lập lịch + Validator nằm ở `assistant-planning/planning-engine.ts`.

Bị thay (đường chat/lập lịch cũ, đặt sau flag):

| File | Vai trò hiện tại | Điểm cắm |
|---|---|---|
| `K:app/trips/new/page.tsx:23` | render `TripRequirementForm` | Điểm swap UI an toàn nhất: `allowed ? (flag ? <ChatPlanner/> : <TripRequirementForm/>) : <AccessDenied/>`. Auth (`requireActor`, :13) giữ nguyên |
| `K:app/assistant/page.tsx:27-28` | render `AssistantRuntimeChat` -> `AssistantV2Chat` (sau cổng `isQaRuntimeEnabled`, :14-26) | Swap component ở :28; cổng env cũ vẫn bao ngoài |
| `K:components/assistant/assistant-v2-chat.tsx` (264 dòng), `assistant-v2-client.ts:9-13`, `planning-client.ts` (463), `planning-panel.tsx`, `assistant-plan-message.tsx` | UI chat + client gọi `/api/ai/planning` | Thay bằng UI chat tripsage. LƯU Ý `AssistantV2Chat` còn được `destination-assistant-panel.tsx:201` dùng cho Hỏi-đáp điểm đến, và `assistant-v2-chat.tsx:39` có nhánh IN_TRIP (`tripId`) |
| `K:app/api/ai/planning/route.ts:6` -> `planning-http.ts:11-36` -> `assistant-agent-v2/http-service.ts:125` | route + dispatch START/TURN/ORIGIN/SAVE/RECONCILE | KHÔNG thay tại chỗ: cùng route phục vụ in-trip (`http-contract.ts:85`, `tripId`) và QA. Thêm route mới (vd. `app/api/ai/chat/route.ts`) |
| `K:assistant-agent-v2/travel-planning-session.ts` (356), `planning-response.ts` (372), `planning-replanning.ts` (159), `planning-actions.ts` (116) | vòng hội thoại planning V2, soạn lời, replan có giới hạn | Bỏ khỏi đường mới; thay bằng tool-loop |

Được gọi lại từ chat mới (giữ nguyên, là cầu nối):

| File:dòng | Dùng làm |
|---|---|
| `K:modules/assistant-planning/planning-engine.ts:34` `scheduleSelection(needs, selection, candidates, routes, now)` | Cầu nối chính: nhận `PlanningSelection` (id điểm theo ngày) -> `assertTripRequirementClear` (:35), `assertPlanningSelection` (:36), Stadia, `schedulePlannerDays` (:71), `validatePlannerDays` (:73; nhánh journey :41) -> `PlannerResult` |
| `K:planning-engine.ts:20-32` `assertPlanningSelection` | Chặn id ngoài DB/VISIBLE, trùng, vượt pace, thiếu `requiredDestinationIds` (ném `INVALID_AI_PLAN`, `PACE_LIMIT`, ...). Tool agent nên trả các mã này làm kết quả tool để model tự sửa |
| `K:planning-engine.ts:115-172` `generatePlanningProposal` | Vòng repair 3 lượt hiện có (chỉ retry khi `PACE_LIMIT`/`INVALID_AI_PLAN`, :146) và `recheck` (:170). Có thể thay `generate` (kiểu `PlanningGenerator`, :91) bằng tool-loop mà giữ phần còn lại |
| `K:assistant-planning/planning-runtime.ts:53-69` `planningDependencies.forActor` | Cấp `candidates` (`retrievePlannerCandidates`), `recheck`, `routes` (`createStadiaRoutesProvider`, key từ `ENV.STADIA_MAPS_API_KEY`), `save`, `validateForSave` |
| `K:trip-planner/planner-candidates.ts:23,41` | Tool `listEligibleCandidates` / recheck (DB điểm đến, `MAX_CANDIDATES = 64`) |
| `K:trip-planner/planner-routes.ts:16,63` | Tool ước lượng tuyến Stadia (deadline 10s, :11) |
| `K:trip-requirement/trip-clarification-server.ts:43` `assertTripRequirementClear` | Cổng bắt buộc trước khi lập: ném `TRIP_REQUIREMENT_UNCLEAR` 422 kèm `blockers[{id,field,kind,question}]` (:15-20, :56-61); chat chuyển blockers thành câu hỏi |
| `K:trip-requirement/trip-requirement-readiness.ts:65,98` | `evaluateTripRequirement` (thiếu duration/transport/startDate) và `assertStartDateForFinalConfirmation` (trước Save) |
| `K:trip-requirement/trip-clarification-rules.ts` (449), `trip-requirement-check.ts:228` | Nguồn câu hỏi làm rõ xác định; dùng lại thay cho prompt tự do |
| `K:trip-save/trip-save-adapter.ts:5` `toSaveProposal` | `PlannerResult` -> `TripProposal`; trả `null` nếu `!eligibleForFinalConfirmation` hoặc còn stop không `PLANNED` |
| `K:trip-save/trip-save-service.ts:101,118,135` | `previewTripValidation`, `saveTrip` (requireTraveler + `executeIdempotentWrite`) |
| `K:assistant-planning/planning-service.ts:42-115` `executePlanning` (SAVE :94-114) | Đường Save của workspace: kiểm hash đề xuất, `reserveSave`, `completeSave` (:32-40, lỗi không phải AppError -> `OPERATION_STATUS_UNKNOWN` 503) |
| `K:app/api/trips/route.ts:16-18` | Save HTTP thẳng (có `Idempotency-Key`) |

Replan (`planning-replanning.ts`) nếu muốn giữ "sửa lịch trong chat": chỉ thao tác trên id (`selection`, :57) rồi gọi lại `scheduleSelection` (:145) và `deps.recheck` (:147). Tool-loop mới có thể gọi cùng đường (`applyPlanningEdit` :92, `assertEditScope` :111) thay vì để model tự sửa JSON.

### 9.2 File tripsage thuộc khối chat và phụ thuộc cần thay khi port

Phát hiện quan trọng: `POST /api/chat` KHÔNG dùng `ToolLoopAgent`/itinerary-agent. `handleChat` gọi `streamText` trực tiếp với `toolRegistry` 29 tool (`TS:app/api/chat/_handler.ts:1391,1534`, `TS:ai/tools/index.ts:85-116`). `createItineraryAgent` (`TS:ai/agents/itinerary-agent.ts:65-145`, phase 40/33/27) chỉ phục vụ route khác `/api/agents/itineraries`. "Agent + tool-loop" trong chat = `streamText` + `stopWhen: isStepCount(stepLimit)` (mặc định 10, `TS:app/api/chat/route.ts:25-27`).

| Nhóm | File (dòng) | Phụ thuộc cần thay |
|---|---|---|
| UI | `TS:app/(app)/chat/{page,layout,chat-client}.tsx` (17/33/553), `components/chat/message-item.tsx` (741), `components/ai-elements/{conversation,message,prompt-input,response,reasoning,sources,tool,itinerary-timeline,...}.tsx` | `@ai-sdk/react` `useChat`, `DefaultChatTransport` (chat-client.tsx:127), `streamdown`, shadcn `components/ui/*`, `@schemas/ai`; `getBrowserClient()` Supabase upload đính kèm (:239,:300); `requireUser` Supabase ở layout.tsx:29; chuỗi UI tiếng Anh |
| Route | `TS:app/api/chat/route.ts` (180), `_handler.ts` (1672), `_ui-message-parts.ts` (377), `_metadata-helpers.ts`, `sessions/*`, `attachments/*` | `withApiGuards` (`TS:lib/api/factory.ts`: Supabase auth cookies, BotID, Upstash ratelimit `chat:stream`, CSRF), `getAdminSupabase`, bảng `chat_sessions`/`chat_messages`/`chat_tool_calls` (_handler.ts:408,498,758,802,1335), `handleMemoryIntent` + pgvector (:1181), `lib/tokens/*`, `isChatEphemeralEnabled` |
| Tool-loop/agent | `TS:ai/tools/index.ts`, `ai/tools/server/injection.ts`, `scoped-tool-lists.ts`, `ai/lib/tool-factory.ts` (730), `ai/agents/{agent-factory,itinerary-agent,types}.ts`, `ai/timeout.ts`, `ai/telemetry.ts`, `prompts/agents.ts`, `ai/constants.ts` (system prompt tiếng Anh) | `tool-factory.ts` kéo `lib/cache/upstash`, `lib/ratelimit/upstash`, `next/headers`; `planning.ts` dùng Redis `getRedis()` + khóa phiên (:40-64) + `createServerSupabase`; `rag.ts` Supabase; `places/maps/web-search/web-crawl` Google/Firecrawl |
| Model | `TS:ai/models/registry.ts` (398) | `@/lib/supabase/rpc` (BYOK), `@ai-sdk/{openai,anthropic,xai}`, gateway. KLTN lấy key từ `effectiveConfig("OPENAI")` (`K:modules/ai/qa-json-provider.ts:58`) |
| Hook streaming | Không có hook riêng: trạng thái nằm trong `ChatClient` (`useChat` + `onData` nhận `data-status` transient, chat-client.tsx:154-158). `features/chat/hooks/chat/use-agent-status-websocket.ts` là kênh WebSocket khác | Bỏ websocket; dùng `data-status` |

Tool mới cần viết cho KLTN (không port): đọc blockers/thu thập requirement, `listEligibleCandidates` (DB), `estimateRoute` (Stadia, server-only), `proposeItinerary({days:id[][]})` -> `scheduleSelection`, `savePlan` -> `saveTrip` sau xác nhận người dùng. 29 tool tripsage (flight, lodging, Google Places, web search, Redis plan, memory) phải bị loại khỏi registry.

Thư viện KLTN chưa có: `ai`, `@ai-sdk/react`, `@ai-sdk/openai` (`K:apps/web/package.json`: next ^16.3.4, react ^19.2.8, zod ^4.5.4; KLTN gọi OpenAI bằng `fetch`). tripsage ghim `ai@7.0.28`, `@ai-sdk/react@4.0.30` và dùng API `instructions`, `isStepCount`, `onStepEnd`, `toUIMessageStream`, `runtimeContext`; chưa xác minh khớp bản sẽ cài ở KLTN.

### 9.3 Hợp đồng dữ liệu hai bên cần cầu nối

| Đối tượng | tripsage | KLTN |
|---|---|---|
| Request chat | `{id?, message?: UIMessage, messageId?, messages?, model?, sessionId?, trigger?: "submit-message" or "regenerate-message", desiredMaxTokens?}` strict (`TS:app/api/chat/route.ts:62-71`); không có Idempotency-Key | `assistantV2RequestSchema` (`K:http-contract.ts:84-91`): START/TURN/LOCATION/ORIGIN/RECONCILE/SAVE; header `Idempotency-Key` `^[a-zA-Z0-9_-]{8,128}$` bắt buộc (`planning-http.ts:17-18`), same-origin (:15), body <= 1 MiB |
| Response | UI message stream (SSE), `data-status` transient, metadata `{requestId, sessionId, finishReason, totalUsage}` | JSON envelope `apiSuccess`, `Cache-Control: private, no-store`, `X-Assistant-Runtime: v2` (`planning-http.ts:12`) + `stateToken` capsule |
| Đầu vào lập lịch | `itineraryPlanRequestSchema`: `{destination, durationDays?, interests?: string[], partySize?, travelDates?: string, budgetPerDay?}` (`TS:domain/schemas/agents.ts:112-122`) | `tripRequirementInputSchema` (`K:trip-requirement-contract.ts:282`): `{startDate: date or null, journey?, durationDays 1-14 bắt buộc, transport MOTORCYCLE or CAR bắt buộc (không mặc định), companions, interests: enum 7 giá trị, pace RELAXED/MODERATE/PACKED, mobilityConstraints}` strict. Khác: không có `destination`/`budgetPerDay`; interests tự do vs enum |
| Kết quả hiển thị | `itineraryPlanResultSchema` `itin.v1`: `days[{day, date?, title?, summary?, activities[{name, time?: string, location?: string, description?, url?}]}], destination, overview?, sources[]` (`TS:domain/schemas/agents.ts:130-141`). Giờ là chuỗi tự do, không có id điểm đến | `plannerResultSchema` (`K:planner-contract.ts:50`): `days[{day, date, stops[{order<=4, destination{id,...}, arrivalMinute, departureMinute, visitDurationMinutes, scheduleState, inbound TravelLeg(Stadia), validationStatus}]}], checks[5], status, eligibleForFinalConfirmation, warnings, reasonCodes`; `superRefine` cấm PROPOSAL_READY khi chưa PASS hết |
| Điểm trung gian (nên là đầu ra của LLM) | không có | `PlanningSelection = {days: string[][]}` (`K:planning-contract.ts:238`; tối đa 4 id/ngày, 1-14 ngày, <= 28 id) |
| Lưu | `saveTravelPlan` đổi status trong Redis | `TripSaveRequest {confirm: true, proposal: TripProposal}` (`trip-save-contract.ts:5-13`), `visits[{destinationId, startMinute, plannedDurationMinutes, order}]`, cần `startDate`; kết quả `MutationOutcome` SUCCESS/FAILED/UNKNOWN |
| Hội thoại bền | Supabase `chat_sessions/messages/tool_calls` | workspace Prisma (`planningWorkspaceSchema`, version CAS) + capsule mã hóa + head store; `SAVE` cần `version` + hash đề xuất (`planning-service.ts:108`) |

Cầu nối tối thiểu: (a) `UIMessage` <-> text lượt; (b) tool `proposeItinerary` đầu vào `PlanningSelection`, đầu ra `PlannerResult` rút gọn cho model + một data part riêng (vd. `data-itinerary`) mang `PlannerResult` đầy đủ để UI vẽ, thay cho parse JSON `itin.v1` từ text (`TS:message-item.tsx:357` `parseSchemaCard`); (c) `PlannerResult` -> `TripProposal` bằng `toSaveProposal` (có thể null).

### 9.4 Rủi ro mới phát hiện

1. Chat tripsage không có contract itinerary có cấu trúc: lịch hiện ra do model tự in JSON `itin.v1` trong text hoặc `createTravelPlan` (record lỏng). Không có `destinationId`, giờ là chuỗi. Port nguyên khối thì không ánh xạ được sang `PlannerResult`/Save. Bắt buộc dùng tool có schema `PlanningSelection`.
2. "Chạy `validatePlannerDays` nhưng chưa chặn" chỉ khả thi ở tầng hiển thị. Ba chỗ vẫn chặn cứng: (i) `plannerResultSchema.superRefine` cấm `PROPOSAL_READY` khi check chưa PASS; (ii) `toSaveProposal` trả null khi `!eligibleForFinalConfirmation` (`trip-save-adapter.ts:7`); (iii) `executePlanning` SAVE gọi `validateForSave(...).canConfirm` (`planning-service.ts:112`) và `saveTrip` kiểm lại. Muốn "không chặn" khi lưu phải đổi hợp đồng Save, tức đụng bất biến Validator/Save của AGENTS.md; flag không giải quyết được.
3. Nhánh không-journey: `eligibleForFinalConfirmation = false` hằng số (`planning-engine.ts:77`), nên lịch không có journey không qua được `toSaveProposal`; chỉ nhánh journey (:47-49) có thể eligible. Cần kiểm tra đường Save hiện hành trước khi hứa "vẫn lưu qua executeIdempotentWrite" cho mọi lịch từ chat.
4. Thay route `/api/ai/planning` tại chỗ sẽ làm hỏng trợ lý in-trip, Hỏi-đáp điểm đến có trích dẫn và đối soát SAVE/RECONCILE vì dùng chung endpoint, capsule và `AssistantV2Chat` (`destination-assistant-panel.tsx:201`). Nên thêm route + component mới sau flag, không xóa V2.
5. Streaming xung đột với idempotency/UNKNOWN: `/api/chat` không có `Idempotency-Key` và lưu message từng bước. Save phải là lời gọi JSON không stream riêng, retry cùng key. Nếu stream bị ngắt, không được coi tool `savePlan` đã thành công.
6. Hai đường gọi OpenAI: cũ dùng `fetch` + `runtime-config` (model ghim `gpt-6-luna` ở `planning-response.ts:336`, `planning-replanning.ts:44`, giới hạn byte/token trong `qa-json-provider.ts`), mới dùng `@ai-sdk/openai`. Phải cấp key qua `effectiveConfig("OPENAI")`; không port `registry.ts` (BYOK Supabase). Có nguy cơ mất giới hạn input/output và `store:false` nếu không cấu hình lại.
7. `maxDuration`: tripsage 60s, KLTN planning route 120s; mỗi lần `scheduleSelection` có thể tốn tới 10s Stadia (`planner-routes.ts:11`) và tool-loop có thể gọi nhiều lần. Nên giới hạn số lần gọi `proposeItinerary` mỗi lượt (đề xuất 2-3).
8. Admission: KLTN dùng `createPlanningAdmission` (8 yêu cầu/phút/user, 3 đồng thời, in-memory theo instance, `planning-admission.ts`), tripsage dùng Upstash. Route stream mới phải tự gọi admission, nếu không sẽ bỏ qua giới hạn và tool-loop nhân chi phí.
9. Test khóa-nguồn: `app/trips/new/us25-fe-connect-source.vitest.test.ts`, `us27-fe-nosubst-source.vitest.test.ts`, `components/trip-planner/trip-theme.vitest.test.ts` đọc source bằng `readFileSync` (`trip-requirement-form.tsx`, `natural-language-input.tsx`, `preference-extraction-client.ts`). Xóa/đổi tên file làm test đỏ; chỉ bọc bằng flag, không xóa.
10. Prompt injection: tripsage chỉ có prompt tiếng Anh và đưa kết quả tool trực tiếp vào ngữ cảnh. Khi chỉ còn tool nội bộ, vẫn phải coi `description` điểm đến là dữ liệu (KLTN đã nêu ở `planning-replanning.ts:61`).
11. Registry rò tool: model toàn quyền chọn tool trong `streamText`; một tool tripsage lọt vào (web search, Google Places) vi phạm "chỉ DB + Stadia". Cần allow-list cứng và test khẳng định registry chỉ chứa tool KLTN.
12. i18n/UI: `ItineraryTimeline` ("Day", "Itinerary"), system prompt, "Thinking…" đều tiếng Anh. Bản đồ/ảnh/`TravelLeg` của KLTN (`components/trip-planner/itinerary-map.tsx`, `planner-presentation.tsx`) không có ở tripsage nên tái dùng thay vì port timeline.

### 9.5 Còn chưa xác minh (mục này)

- Chưa đọc đầy đủ `K:trip-save/trip-save-service.ts` (chỉ dòng chính) và chưa xác nhận dòng chính xác của `superRefine` trong `planner-contract.ts` (~:58-60).
- Chưa kiểm tra API `ai@7.0.28` của tripsage khớp phiên bản sẽ cài ở KLTN; chưa đọc `use-agent-status-websocket.ts`, `_ui-message-parts.ts`, `sessions/*`.
- Không chạy test/typecheck; file:dòng lấy từ working tree ngày 2026-11-14 (bỏ qua bản sao cũ trong `.claude/worktrees/` và `.cache/`).

- (2026-11-14) Q12a: chủ dự án muốn dùng Google cho toàn bộ tính năng tripsage dùng. Đảo lại Q3 (chỉ DB + Stadia). **Xung đột chưa duyệt**: địa điểm Google không có `destinationId` trong DB Hà Giang, nên Trip/ItineraryVisit không tham chiếu được; Validator thiếu dữ liệu (giờ mở cửa, điểm đến eligible); credential Google chỉ server-side; điều khoản Google Maps Platform về lưu/cache dữ liệu Places cần xác minh. Q12b: adapter Google sau cờ cấu hình. Q12c: copy rồi sửa, giữ thông báo MIT trong ADR và NOTICE.

- (2026-11-14) Cập nhật quyết định: Q16/Q19 cho phép nguồn tra cứu ngoài; Q17b dùng toàn bộ tính năng tripsage (Google Places/Maps, web search, Firecrawl, Amadeus); Q18b thêm migration Prisma lưu địa điểm ngoài DB (ví dụ `ExternalPlace`, `ItineraryVisit` tham chiếu `destinationId` hoặc external). Q7–Q15, Q20 đồng ý theo đề xuất. Xung đột mới chưa duyệt: (1) Validator thiếu dữ liệu cho địa điểm ngoài ⇒ không PASS ⇒ bị chặn Save (Q13); (2) đảo bất biến "chỉ điểm đến VISIBLE trong DB"; (3) nội dung web/Firecrawl là dữ liệu không tin cậy (prompt injection); (4) thêm key Firecrawl, Amadeus, Google chỉ server-side; (5) điều khoản lưu dữ liệu Google, scraping; (6) cần story + ADR + migration Development trước.

- (2026-11-14) Q13 chốt: chặn Save khi Validator chưa PASS vẫn giữ. Lịch có địa điểm ngoài DB thiếu dữ liệu (ví dụ giờ mở cửa) thì chỉ hiển thị, không lưu được. Chấp nhận hệ quả này. Q21–Q23 vẫn chờ xác nhận.

- (2026-11-14) Chốt Q21'a: check "chưa kiểm" không chặn Save nhưng cần người dùng xác nhận rõ và Trip lưu trạng thái "chưa kiểm"; check FAILED vẫn chặn. Thay thế Q13. Bất biến Save bị đổi, cần thiết kế hợp đồng Save + migration. Q22, Q23 đã chốt như đề xuất. Amadeus bỏ (Q24c). Chờ chủ dự án duyệt story + ADR-36 (Q25 bước 2).
