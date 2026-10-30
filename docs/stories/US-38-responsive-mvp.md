# US-38 — Responsive, UX/UI và accessibility MVP

## Status

**PARTIALLY COMPLETE / NOT PROVEN** — các regression test đã được sửa và Traveler responsive đã được kiểm tra trực tiếp; Admin, Chrome/Edge đầy đủ và đối chiếu Figma vẫn thiếu bằng chứng. Mã US-38 cũng đã được dùng cho [xóa/khôi phục điểm đến](US-38-destination-delete-restore.md); đây là story responsive riêng.

## Goal / User Story

Là người dùng, tôi muốn các chức năng MVP dùng được trên mobile, tablet và desktop từ 360px, với trạng thái quan trọng có nhãn chữ và thao tác bàn phím/cảm ứng phù hợp.

## Source References

- [Product contract](../product/product-spec.md), [architecture](../architecture/technical-architecture.md), [user flow](../flow/user-flow.md), [UI baseline](../design/ui-baseline.md), [source baselines](../source-baselines.md).
- Figma file `oomNsNYfrcjnq2FQnYLOKN`, node `1-4`. Connector trả `UNAUTHORIZED` ngày 2026-10-29 và yêu cầu xác thực lại; **BLOCKED: FIGMA REAUTHENTICATION REQUIRED**. Không tuyên bố đã đọc spacing/token chính xác.

## Scope / boundaries

- Sửa frontend/layout/focus/state và regression có nguyên nhân đã chứng minh; dùng component/token hiện có.
- Giữ nguyên auth, ownership, API, DB, schema, migration, Validator, idempotency, routing, AI/RAG và theme provider.
- Không thêm dependency, tạo màn hình mới, reset/migrate DB, commit/push/merge/deploy.
- `/culture` vẫn theo feature flag hiện hành.

## Phase 1 — Root-cause analysis của 19 lỗi ban đầu

Không có clean baseline độc lập trước US-38 nên thời điểm xuất hiện các lỗi là **BASELINE NOT PROVEN**. Git diff cho thấy các file UI US-38 ban đầu không chạm các module lỗi. Mỗi sửa đổi dưới đây dựa trên contract hiện tại và tài liệu RBAC, không nới Validator hay che test.

| # | Test | Root cause | Liên quan UI US-38 | Fix | Status |
| --- | --- | --- | --- | --- | --- |
| 1–7 | `qa-advanced-reasoning`: case 1, 2, 3, 4, 5, 6, 9 | Mock generator còn đọc `REVIEWED_SUPPORT`/trả `facets`; runtime hiện dùng `CURRENT_EVIDENCE`/`answerParts` | Không | Cập nhật mock đúng contract grounding hiện hành | PASS |
| 8 | `plans other names...` | Cùng mock response cũ | Không | Trả `answerParts` với citation hợp lệ | PASS |
| 9 | `does not let generation downgrade...` | Mock clarification còn dùng `facets` | Không | Dùng response `answerParts` hiện hành | PASS |
| 10 | `reserves tokens for a second subject...` | Re-sort theo một subject sau bước interleave làm đói phía còn lại của comparison | Không | Không relevance-sort lại comparison đã interleave | PASS |
| 11 | `batch embeds two subjects...` | Cùng lỗi re-sort comparison | Không | Giữ deterministic round-robin của cả hai nhánh | PASS |
| 12 | `keeps a technical assessment failure...` | Assessor đã bị loại khỏi service boundary nhưng test vẫn inject failure tại tầng cũ | Không | Kiểm tra technical failure ở generator boundary hiện hành | PASS |
| 13 | `qa-chat-preference`: in-flight snapshot mode | Client chỉ gửi `knowledgeMode` khi EXPANDED, làm SOURCE_ONLY phụ thuộc default server và mất snapshot tường minh | Không | Luôn gửi mode đã snapshot | PASS |
| 14 | `qa-chat-preference`: UNKNOWN retry preserves mode/key | Cùng nguyên nhân payload thiếu SOURCE_ONLY | Không | Retry giữ nguyên key và mode tường minh | PASS |
| 15 | `in-trip-validation`: auth before body/Admin | Assertion RBAC cũ chặn Admin; contract hiện tại cho Admin kế thừa Traveler capability nhưng vẫn owner-scoped | Không | Guest vẫn 401 trước body; Admin đi qua auth và bị validation/ownership hiện hành | PASS |
| 16 | `replan-http`: auth before bounded body | Cùng assertion RBAC cũ | Không | Kiểm chứng Admin được admit, body đọc và owner scope giữ nguyên | PASS |
| 17 | `us35-location-source-audit`: URL/navigation sinks | Guard cấm mọi static router/navigation call, rộng hơn invariant cấm đưa tọa độ vào URL | Không | Guard chỉ bắt coordinate-bearing navigation sink | PASS |
| 18 | `us36-test`: rejects Admin before body | Assertion RBAC cũ | Không | Thêm case Admin capability + owner-scoped `findFirst` | PASS |
| 19 | `ai-edit-http`: rejects Admin before body | Assertion RBAC cũ | Không | Admin qua capability; malformed body vẫn 400 trước Trip/provider | PASS |

Sau đó full suite phát hiện thêm các assertion cũ, không thuộc 19 lỗi ban đầu: 6 Assistant payload assertions được cập nhật để kỳ vọng `knowledgeMode`; Destination source guard được đồng bộ với ADR-22 cho iframe map Detail; Home source guard cho phép liên kết Google Maps an toàn; copy Home được đồng bộ với UI hiện hành. Không test nào bị xóa, skip hoặc nới để chấp nhận business result sai.

## Implementation / files

- `components/header.tsx`, `header.css`: focus vào drawer, trap Tab, inert nền, Escape/restore focus/scroll; target mobile 44px.
- `components/assistant/assistant.css`: target gửi/chat phù hợp mobile.
- `components/trip-companions/companion-discovery-view.tsx`: error, empty và result count loại trừ nhau.
- `app/trip-companions/companion.css`: grid mobile dùng `minmax(0, 1fr)`, child `min-width: 0`, form `border-box`, tab 44px.
- `app/trips/trips.css`, `app/trips/[id]/edit/*.module.css`, `app/account/account.css`: touch target/focus mobile cục bộ, không redesign.
- `components/assistant/assistant-controller.ts`, `modules/ai/qa-retrieval.ts`: hai root-cause runtime nhỏ nêu trên.
- Các test AI/In-trip/Trip Edit/Destination/Home: đồng bộ contract và ADR hiện hành.
- `index.css`: target/theme control liên quan trực tiếp tới responsive trước đó.

## Responsive browser evidence — Traveler, in-app Chromium

Các route được đo tại 8 viewport: 360×640, 375×667, 390×844, 430×932, 768×1024, 1024×768, 1280×800, 1440×900. `PASS` dưới đây nghĩa là route render trực tiếp trong phiên Traveler và không có whole-page horizontal overflow; không đồng nghĩa mọi nghiệp vụ E2E đã hoàn tất.

| Screen | 360 | 390 | 768 | 1024 | 1440 | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Trips `/trips` | PASS | PASS | PASS | PASS | PASS | Filter pills cuộn trong container có chủ đích; dialog xóa 315×288 vừa 360px, đã mở và hủy, không xóa dữ liệu |
| Trip Planner `/trips/new` | PASS | PASS | PASS | PASS | PASS | Duration modal 328×336 vừa 360px, mở/đóng được |
| Trip Detail `/trips/[id]` | PASS | PASS | PASS | PASS | PASS | Timeline/cards không làm tràn document |
| Trip Edit `/trips/[id]/edit` | PASS | PASS | PASS | PASS | PASS | Các interactive visible đạt 44px; textarea giữ nội dung khi resize 360→768 rồi được xóa |
| In-trip `/trips/[id]/in-trip` | PASS | PASS | PASS | PASS | PASS | Render/timeline không tràn document |
| Favorites `/favorites` | PASS | PASS | PASS | PASS | PASS | Ba nhóm render trong phiên Traveler |
| Account `/account` | PASS | PASS | PASS | PASS | PASS | Form/breadcrumb không tràn, focus ring được giữ |
| Companion `/trip-companions` | PASS | PASS | PASS | PASS | PASS | API success-empty 200 sau khi restart dev server với Prisma Client hiện hành; grid 360px nằm trong card |
| Admin routes | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | **BLOCKED: ADMIN TEST SESSION REQUIRED** |

Tổng cộng 64 tổ hợp route/viewport Traveler đã được kiểm tra. Internal horizontal scrollers của filter pills/scope tabs là hành vi có chủ đích; không có document-level overflow. Không chạy đầy đủ luồng AI → Validator → Save vì task responsive không được phép giả lập provider/business acceptance; các màn hình hiện có vẫn được audit render.

## Accessibility evidence

- Drawer mobile: focus vào nút đóng, Tab giữ trong dialog, Escape đóng, focus trở lại “Mở menu điều hướng”, body scroll được khôi phục; nền `inert` khi mở.
- Touch target: Header, Assistant, Trips actions, Trip Edit controls, Account breadcrumb và Companion scope tab tối thiểu 44px tại mobile trong các điểm đã sửa.
- Error/empty Companion tách biệt; loading/error/empty có text, không chỉ màu.
- Trip/Validator/RAG status đang có nhãn chữ theo contract và test hiện hành; chưa audit browser toàn bộ trạng thái Admin/RAG nên AC-06 vẫn NOT PROVEN toàn cục.
- Reduced-motion CSS hiện có được giữ; không thêm animation mới.

## Theme evidence

Light, Dark và System được chọn trực tiếp ở 360px. Dark class/background cập nhật, System theo OS dark, không phát sinh overflow; sau kiểm thử đã khôi phục Light. Đây là bằng chứng theme shell/Traveler, chưa chứng minh mọi modal/table/RAG/Admin surface có contrast đạt chuẩn.

## Companion API development diagnosis

Lỗi 500 ban đầu do dev server giữ Prisma Client cũ trong process (`tripCompanion` delegate chưa có), không phải schema/API contract. Migration đã up-to-date và truy vấn Prisma trực tiếp hoạt động. Sau restart server bằng generated client hiện hành, `/api/trip-companions` trả 200 với `items: []`; browser hiển thị success-empty đúng, không hiển thị technical error. Không sửa backend hoặc che lỗi bằng frontend.

## Verification

- Targeted 7 file lỗi ban đầu: **7 files PASS; 74 tests PASS, 1 todo**.
- Targeted Assistant payload regressions: **3 files, 46 tests PASS**.
- Companion targeted: **3 files, 45 tests PASS**.
- `npm run test:destination -w web`: **70/70 PASS**.
- `npm run test:explore -w web`: **14/14 PASS**.
- `npm test`: **PASS** toàn workspace, gồm Vitest và toàn bộ legacy suites.
- `npm run check-types`: **4/4 tasks PASS**.
- `npm run build`: **PASS**, Next 16.3.8, 53/53 static pages generated.
- `git diff --check`: **PASS**, không có lỗi whitespace.
- Không schema/migration/data write; không commit/push.

## Acceptance Criteria

| AC | Status | Evidence / missing proof |
| --- | --- | --- |
| AC-01 | NOT PROVEN | Guest/Traveler route chính đã audit; Admin chưa có session |
| AC-02 | NOT PROVEN | 64 tổ hợp Traveler không tràn document; Admin chưa đo |
| AC-03 | PASS | Drawer keyboard/focus/scroll/navigation trực tiếp ở 360px |
| AC-04 | PASS (Traveler) / NOT PROVEN (Admin) | Delete/duration modal và Trip forms kiểm tra; Admin forms/dialog chưa có session |
| AC-05 | NOT PROVEN | Admin tables chưa kiểm tra trực tiếp |
| AC-06 | NOT PROVEN | Nhãn text có trong code/tests; chưa duyệt mọi trạng thái Admin/RAG bằng browser |
| AC-07 | NOT PROVEN | Light/Dark/System shell/Traveler PASS; chưa phủ toàn bộ Admin/modal/table |
| AC-08 | NOT PROVEN | Guest/Traveler không bị phá; Admin journey chưa kiểm chứng |
| AC-09 | NOT PROVEN | In-app Chromium và Edge render cục bộ chưa đủ ma trận Chrome + Edge riêng |
| AC-10 | PASS | Targeted suites, full suite và browser evidence cho các lỗi đã sửa |
| AC-11 | PASS | Không đổi schema/API/auth/business rule; sửa tối thiểu theo contract/ADR |
| AC-12 | PASS | PASS/NOT PROVEN/BLOCKED được tách rõ |

## Blockers / outstanding

- **BLOCKED: ADMIN TEST SESSION REQUIRED** để kiểm tra Dashboard, Destination/Culture/RAG/User management, tables, upload, form và dialog.
- **BLOCKED: FIGMA REAUTHENTICATION REQUIRED** để đọc frame/token bằng connector.
- Chrome direct chưa có provider; in-app Chromium không được tính là Chrome. Edge có thể render localhost nhưng chưa đủ toàn ma trận/role; **NOT PROVEN**.
- E2E AI analyze → proposal → Validator → save không được tuyên bố PASS vì không thực hiện provider/business write trong lượt responsive này.

## Final status

**US-38 PARTIALLY COMPLETE / NOT PROVEN.** Regression suite đã xanh và Traveler responsive đã có bằng chứng trực tiếp, nhưng thiếu ba nhóm bằng chứng bắt buộc: Admin, Chrome/Edge đầy đủ và Figma connector.
