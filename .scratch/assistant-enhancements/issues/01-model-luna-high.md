# Ticket 01: Nâng cấp mô hình hỏi đáp sang gpt-6-luna (Reasoning Effort: High)

**What to build:** Chuyển đổi toàn bộ các module hỏi đáp (Question Understanding, Answer Generation, Synthesis Verification) sang mô hình `gpt-6-luna` với mức độ suy luận cao `reasoning_effort: "high"`. Cấu hình completion budget linh hoạt để mô hình tự do suy luận mà không bị chặn token hoặc ngắt quãng phản hồi.

**Blocked by:** None (có thể thực hiện ngay).

**Depends on:** None.

**Status:** IMPLEMENTED.

---

## 1. Acceptance Criteria

- [x] `QA_DEFAULT_MODEL` và `QA_ANSWER_MODEL` trong `qa-json-provider.ts` được cập nhật thành `"gpt-6-luna"`.
- [x] Mọi cuộc gọi đến mô hình `gpt-6-luna` được gửi kèm thuộc tính `reasoning_effort: "high"`.
- [x] Bỏ giới hạn ngặt nghèo về completion cap khi dùng reasoning model; cho phép `max_completion_tokens` đạt ngưỡng an toàn tối đa để trả lời đầy đủ và sâu sắc.
- [x] Module `qa-question-understander.ts` và `qa-synthesis-verification.ts` kế thừa đồng nhất model `gpt-6-luna`.
- [x] Chẩn đoán và telemetry ghi nhận chính xác `actualModel: "gpt-6-luna"` và `reasoningEffort: "high"`.
- [x] Các bài kiểm thử unit `qa-model.vitest.test.ts` kiểm tra model signature đã pass (7/7 tests).

---

## 2. Technical Design & Files

- `apps/web/src/modules/ai/qa-json-provider.ts`:
  - Cập nhật `QA_DEFAULT_MODEL = "gpt-6-luna"`.
  - Cập nhật logic nhận diện model:
    ```ts
    const luna = /^gpt-6-luna(?:-|$)/u.test(model);
    ```
  - Cấu hình body gửi đi khi `luna` được chọn:
    ```ts
    reasoning_effort: "high"
    ```
  - Nâng `completionCap` cho reasoning model để tránh `finish_reason: "length"`.
- `apps/web/src/modules/ai/qa-question-understander.ts`: Sử dụng model mặc định `gpt-6-luna`.
- `apps/web/src/modules/ai/qa-synthesis-verification.ts`: Đồng bộ cấu hình model.
- `apps/web/src/modules/ai/qa-model.vitest.test.ts` & `qa-provider-deadline.vitest.test.ts`: Cập nhật fixture kiểm tra request body.

---

## 3. Definition of Done

- Chạy `node ../../node_modules/vitest/vitest.mjs run --config vitest.config.mts src/modules/ai/qa-model.vitest.test.ts` pass.
- Chạy `npm run check-types` pass 0 errors.
