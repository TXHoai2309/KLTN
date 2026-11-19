# Báo cáo 35 test thất bại — AI/planning

**Ngày:** 18/11/2026  
**Phạm vi:** Web Vitest, bốn file thất bại trong lần chạy full test gần nhất  
**Lệnh kiểm tra:**

```text
npm test -- --reporter=dot
```

## Executive summary

Lần chạy riêng bốn file cho kết quả **105 PASS, 35 FAIL, 0 pending**. Các test thất bại tập trung vào hai dạng:

1. Một số fixture vẫn yêu cầu model `gpt-6-luna` với `reasoning_effort: high`, trong khi cấu hình runtime hiện dùng `gpt-6.1-sol` với tham số khác.
2. Một số fixture offline không cô lập đầy đủ đường đọc cấu hình/runtime và embedding. Luồng bị dừng sớm ở preflight/provider, trả `AI_UNAVAILABLE` HTTP 503 trước khi tới assertion nghiệp vụ mà test muốn kiểm tra.

Các kết quả này chưa chứng minh 35 lỗi sản phẩm độc lập. Đây là báo cáo failure của test; cần thống nhất lại contract model và dependency injection của fixture trước khi đánh giá lại hành vi nghiệp vụ.

## Tổng hợp theo file

| File | Fail | Nguyên nhân quan sát được |
|---|---:|---|
| `apps/web/src/modules/ai/qa-answer-quality-v2.vitest.test.ts` | 8 | Assertion model fixture cũ: test chờ `gpt-6-luna/high`, request thực tế là `gpt-6.1-sol/medium`. |
| `apps/web/src/modules/ai/qa-conversation-reliability.vitest.test.ts` | 1 | Mock fetch tự fail vì assertion model cũ; provider bọc lỗi thành `AI_UNAVAILABLE`. |
| `apps/web/src/modules/ai/qa-diagnostics.vitest.test.ts` | 25 | Fixture không cô lập đầy đủ runtime config/embedding; nhiều ca dừng sớm ở HTTP 503 thay vì tới stage cần kiểm tra. |
| `apps/web/src/modules/assistant-planning/planning-model.vitest.test.ts` | 1 | Planning provider dừng ở preflight lấy cấu hình và trả `AI_UNAVAILABLE`. |
| **Tổng** | **35** | |

## Chi tiết các failure

### 1. `qa-answer-quality-v2.vitest.test.ts` — 8 failure

Các ca sau đều fail tại assertion request phải có `model: "gpt-6-luna"` và `reasoning_effort: "high"`; nội dung câu trả lời và citation chưa phải điểm fail được quan sát:

- R01 — chấp nhận claim UNESCO có citation hợp lệ.
- R02 — tổng hợp đặc điểm địa chất với citation hợp lệ.
- R04 — phân biệt UNESCO Global Geopark và Di sản thế giới.
- R06 — xác định Cột cờ Lũng Cú thuộc khu vực nào.
- R07 — trả giá vé Cột cờ Lũng Cú theo hồ sơ.
- R08 — phân biệt miễn vé chung và khoản phí riêng.
- `binds generator prompt to current evidence and schema with valid citation IDs`.
- `assessment prompt makes current intent, table coverage and corpus uncertainty explicit`.

Thông báo đại diện:

```text
expected { model: 'gpt-6.1-sol', ... }
to match object { model: 'gpt-6-luna', ... }
```

### 2. `qa-conversation-reliability.vitest.test.ts` — 1 failure

- `keeps factual answers stable across punctuation, repeated turns and previous topics using real assessment/generation adapters`.

Mock fetch trong test chứa assertion yêu cầu `gpt-6-luna/high`. Assertion này ném lỗi khi request dùng cấu hình hiện tại; `qa-json-provider.ts` bắt lỗi ngoài provider và ánh xạ thành:

```text
AppError: Dịch vụ AI hiện không khả dụng.
code: AI_UNAVAILABLE
HTTP: 503
```

Do đó test chưa chạy đến phần so sánh câu trả lời qua các biến thể dấu câu.

### 3. `qa-diagnostics.vitest.test.ts` — 25 failure

#### 4 ca response hợp lệ

- `maps valid provider ANSWERED through the real HTTP/service/adapter path`.
- `maps valid provider PARTIAL through the real HTTP/service/adapter path`.
- `maps valid provider INSUFFICIENT_SOURCE through the real HTTP/service/adapter path`.
- `maps valid provider CLARIFICATION_REQUIRED through the real HTTP/service/adapter path`.

Mong đợi HTTP 200 nhưng nhận HTTP 503.

#### 8 ca kiểm tra tính nhất quán output

- `rejects contradictory unanswered for ANSWERED at the historical stage`.
- `rejects contradictory unanswered for PARTIAL at the historical stage`.
- `rejects contradictory unanswered for INSUFFICIENT_SOURCE at the historical stage`.
- `rejects contradictory unanswered for CLARIFICATION_REQUIRED at the historical stage`.
- `rejects contradictory parts for ANSWERED at the historical stage`.
- `rejects contradictory parts for PARTIAL at the historical stage`.
- `rejects contradictory parts for INSUFFICIENT_SOURCE at the historical stage`.
- `rejects contradictory parts for CLARIFICATION_REQUIRED at the historical stage`.

Mong đợi HTTP 502 (`AI_INVALID_RESPONSE`) nhưng nhận HTTP 503 (`AI_UNAVAILABLE`).

#### 2 ca envelope/JSON lỗi

- `rejects truncation/malformed output before outcome validation 0` — finish reason `length`.
- `rejects truncation/malformed output before outcome validation 1` — JSON malformed.

Mong đợi HTTP 502 nhưng nhận HTTP 503.

#### 2 ca retrieval/persistence flow

- `empty evidence completes INSUFFICIENT_SOURCE without generation dispatch` — mong HTTP 200, nhận 503.
- `records actual order, provider metadata and persistence only after acknowledgement` — mong HTTP 200, nhận 503.

#### 9 ca phân loại failure/diagnostic

- `classifies unavailable without exposing values or changing public codes` — stage/shape diagnostic không khớp kỳ vọng.
- `classifies malformed without exposing values or changing public codes` — mong 502, nhận 503.
- `classifies schema without exposing values or changing public codes` — mong 502, nhận 503.
- `classifies outcome without exposing values or changing public codes` — mong 502, nhận 503.
- `classifies citation without exposing values or changing public codes` — mong 502, nhận 503.
- `classifies grounding without exposing values or changing public codes` — mong 502, nhận 503.
- `classifies persistence without exposing values or changing public codes` — mong `OPERATION_STATUS_UNKNOWN`/503, nhận `AI_UNAVAILABLE`/503.
- `classifies embedding without exposing values or changing public codes` — mong 502, nhận 503.
- `classifies eligibility without exposing values or changing public codes` — mong 502, nhận 503.

Điểm chung: fixture gọi route/service thật và giả lập `fetch`, nhưng embedding provider mặc định lấy API key qua runtime-config service. Dependency này có thể đọc database trước khi sử dụng fetch fixture; khi preflight thất bại, route trả 503 và các assertion về stage sau đó không được thực thi.

### 4. `planning-model.vitest.test.ts` — 1 failure

- `pins understanding, selection and dialogue to Luna/high with no model fallback`.

Test đặt `OPENAI_API_KEY` và `OPENAI_QA_MODEL`, sau đó giả lập fetch. Lần gọi `analyzePlanningText` dừng ở bước preflight của `createQaJsonProvider` với:

```text
AppError: Dịch vụ AI hiện không khả dụng.
file: apps/web/src/modules/ai/qa-json-provider.ts
code: AI_UNAVAILABLE
```

Vì vậy chưa tới các assertion về ba request, model Luna/high hoặc `calendarContext`.

## Nguyên nhân kỹ thuật đã xác minh

- `qa-json-provider.ts` lấy model từ runtime config khi không có `options.model`; runtime default hiện là `gpt-6.1-sol`.
- `openai-model-catalog.ts` cấu hình tham số QA khác nhau theo model: Luna dùng `high`, Sol dùng `medium`.
- Một số test vẫn giữ contract cũ `gpt-6-luna/high`.
- Một số fixture QA diagnostics tạo service thật nhưng không inject embedding provider/runtime-config hoàn toàn, nên có thể fail ở preflight trước khi dùng response fixture.
- Provider cố ý ánh xạ lỗi cấu hình/network thành `AI_UNAVAILABLE`; vì vậy cùng một mã 503 có thể che mất bước test chưa được chạy.

## Tác động và giới hạn

Hiện chưa có bằng chứng từ lần chạy này để kết luận các rule grounding, citation, persistence hoặc diagnostic stage phía sau đều sai. Những assertion đó bị chặn bởi lỗi cấu hình/fixture sớm. Full test cũng dừng ở Vitest; phase legacy không chạy trong lệnh `npm test`.

## Hướng xử lý đề xuất

1. Chốt một contract model cho QA/planning: cập nhật fixture theo runtime `gpt-6.1-sol/medium`, hoặc inject rõ `gpt-6-luna/high` trong các test cần kiểm tra contract Luna.
2. Inject embedding provider và runtime config giả lập trực tiếp vào `qa-diagnostics` fixtures, tránh đọc database/env thật.
3. Chạy lại bốn file riêng; chỉ sau khi preflight pass mới đánh giá các assertion stage/status phía sau.
4. Chạy lại full Vitest và legacy tests, sau đó mới phân loại failure còn lại là lỗi production hay lỗi test contract.

## Trạng thái

`NOT PROVEN`: full web test suite chưa sạch. Báo cáo này chỉ ghi nhận evidence từ test run ngày 18/11/2026; không sửa code, không thay đổi database, không commit/push.
