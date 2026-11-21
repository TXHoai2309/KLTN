# Tickets — Trợ lý chuyến đi trả lời tự nhiên, stream chữ và hiện bước đang làm

**Trạng thái: READY (`01`–`04` chưa làm) — 2026-11-21.** Bốn lát cắt dọc tách từ [spec](../../docs/product/saved-trip-assistant-natural-streaming-spec.md) (phỏng vấn Q1–Q19, 12 User Stories) và [ADR-40](../../docs/decisions.md#adr-40--saved-trip-assistant-streams-through-the-ai-sdk-and-decides-through-tools-2026-11-21), kế thừa ADR-39 (đã triển khai, commit `0df1319`, `fa2874a`).

## Nguồn tham chiếu bắt buộc

- [Spec natural streaming](../../docs/product/saved-trip-assistant-natural-streaming-spec.md): đọc toàn bộ trước ticket đầu tiên.
- [ADR-40](../../docs/decisions.md#adr-40--saved-trip-assistant-streams-through-the-ai-sdk-and-decides-through-tools-2026-11-21), ADR-39, ADR-38, ADR-34 (Caveat policy), ADR-29 (Validator giữ quyền phán quyết).
- [GLOSSARY.md](../../GLOSSARY.md): `Saved-trip assistant`, `Edit draft`, `Itinerary validation`, `Actionable advice suggestion`, `Stated assumption`, `Correction note`, `Caveat policy`.
- Mẫu AI SDK trong repo (bắt chước, đừng đoán API):
  - [tripsage-chat-service.ts](../../apps/web/src/modules/tripsage-chat/tripsage-chat-service.ts)
  - [tripsage-chat-tools.ts](../../apps/web/src/modules/tripsage-chat/tripsage-chat-tools.ts)
  - [tripsage-chat-provider.ts](../../apps/web/src/modules/tripsage-chat/tripsage-chat-provider.ts)
  - [tripsage-chat-client.tsx](../../apps/web/src/components/tripsage-chat/tripsage-chat-client.tsx)
  - test `tripsage-chat-*.vitest.test.ts`, nhất là `tripsage-chat-stream-redaction`.

## Ranh giới kiểm thử

1. **Seam 1 — Dịch vụ / Route Handler `POST /api/trips/[id]/edits/ai`:** DB giả, đồng hồ cố định `Asia/Ho_Chi_Minh`, `MockLanguageModelV4` + `simulateReadableStream` của AI SDK, routing/weather/RAG giả. Mẫu fixture: `apps/web/src/modules/trip-edit/trip-assistant-agent.vitest.test.ts`.
2. **Seam 2 — Giao diện workspace:** render `AiEditBar` / `EditTripClient` bằng `renderToStaticMarkup`, và test hàm đọc stream ở `apps/web/src/lib/trip-edit-client.ts` bằng fetcher giả trả `ReadableStream`. Mẫu: `apps/web/src/app/trips/[id]/edit/ai-onboarding.vitest.test.ts`, `edit-workspace-ui.vitest.test.ts`, `apps/web/src/modules/trip-edit/ai-edit-client.vitest.test.ts`.

## Danh sách ticket và blocking edges

| Ticket | Bị chặn bởi | Trạng thái |
| --- | --- | --- |
| [01 — Vòng suy luận trên AI SDK, giọng người đồng hành, quyết định bằng `apply_to_draft` / `show_options` (vẫn trả JSON)](issues/01-ai-sdk-loop-voice-and-decision-tools.md) | Không có | `done` |
| [02 — Route stream: tiến trình, chữ, kết quả cuối, lọc ID/URL, Correction note](issues/02-streaming-route-redaction-and-correction-note.md) | `01` | `ready` |
| [03 — Giao diện stream: bước đang làm, chữ dần, Dừng, chỉ áp khi có kết quả cuối, bỏ nhãn tư vấn](issues/03-streaming-ui-progress-stop-and-badges.md) | `02` | `ready` |
| [04 — Thử thật với OpenAI, nghiệm thu toàn bộ, tài liệu, commit & push](issues/04-live-check-acceptance-and-release.md) | `03` | `ready` |

## Độ phủ User Stories (spec 1–12)

| Ticket | User Stories |
| --- | --- |
| `01` | 4, 5, 6, 8, 9 (hành vi model qua JSON) |
| `02` | 10, 12 (server), nền cho 1, 2, 3, 11 |
| `03` | 1, 2, 3, 7, 11, 12 (giao diện) |
| `04` | 1–12 kiểm chứng thật với `gpt-6.1-terra` |

## Thứ tự thực thi

`01` → `02` → `03` → `04`, tuần tự. Mỗi ticket kết thúc bằng typecheck và test xanh, cộng một commit cục bộ. **Chỉ ticket `04` được push.**
