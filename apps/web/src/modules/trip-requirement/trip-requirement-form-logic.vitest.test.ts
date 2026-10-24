import { describe, expect, it } from "vitest";

import { tripRequirementInputSchema } from "./trip-requirement-contract";
import {
  buildPayload,
  decideEvaluateResponse,
  decideSubmitRouting,
  getSubmitButtonState,
  mapFieldErrors,
  shouldApplyRequestResponse,
  validateRequiredFields,
  type TripRequirementFormFields,
  type TripRequirementValidationFields,
} from "./trip-requirement-form-logic";

const completeFields: TripRequirementFormFields = {
  startDate: " 2026-10-12 ",
  durationDays: " 3 ",
  transport: "MOTORCYCLE",
  companionType: "COUPLE",
  companionGroupSize: "2",
  interests: ["NATURE", "FOOD"],
  pace: "MODERATE",
  mobilityFlags: ["NO_STEEP_TERRAIN"],
  mobilityNote: "  Cần nghỉ giữa chặng  ",
};

function fields(overrides: Partial<TripRequirementValidationFields> = {}): TripRequirementValidationFields {
  return { ...completeFields, ...overrides };
}

describe("trip requirement form logic", () => {
  it("builds the complete API payload without extra fields", () => {
    expect(buildPayload(completeFields)).toEqual({
      startDate: "2026-10-12",
      durationDays: 3,
      transport: "MOTORCYCLE",
      companions: { type: "COUPLE", groupSize: 2 },
      interests: ["NATURE", "FOOD"],
      pace: "MODERATE",
      mobilityConstraints: {
        flags: ["NO_STEEP_TERRAIN"],
        note: "Cần nghỉ giữa chặng",
      },
    });
    expect(Object.keys(buildPayload(completeFields))).toEqual([
      "startDate",
      "durationDays",
      "transport",
      "companions",
      "interests",
      "pace",
      "mobilityConstraints",
    ]);
  });

  it("normalizes empty optional fields to null", () => {
    expect(
      buildPayload({
        ...completeFields,
        startDate: "",
        companionType: "",
        companionGroupSize: "2",
        pace: "",
        mobilityFlags: [],
        mobilityNote: "  ",
      }),
    ).toMatchObject({
      startDate: null,
      companions: null,
      pace: null,
      mobilityConstraints: null,
    });
  });

  it("converts plain integer text but retains invalid numeric text for server validation", () => {
    expect(buildPayload({ ...completeFields, durationDays: "10" }).durationDays).toBe(10);
    expect(buildPayload({ ...completeFields, durationDays: "2.5" }).durationDays).toBe("2.5");
    expect(buildPayload({ ...completeFields, durationDays: "1e1" }).durationDays).toBe("1e1");
    expect(buildPayload({ ...completeFields, durationDays: "０２" }).durationDays).toBe("０２");
  });

  it("does not send a DOM-tampered transport as a candidate", () => {
    expect(buildPayload({ ...completeFields, transport: "BICYCLE" }).transport).toBeNull();
    expect(buildPayload({ ...completeFields, transport: "CAR" }).transport).toBe("CAR");
  });

  it("maps only the shared fieldErrors detail shape", () => {
    expect(
      mapFieldErrors({
        fieldErrors: {
          durationDays: "Vui lòng nhập số ngày.",
          "companions.groupSize": "Số người chưa phù hợp.",
          _form: "Payload không hợp lệ.",
        },
      }),
    ).toEqual({
      durationDays: "Vui lòng nhập số ngày.",
      "companions.groupSize": "Số người chưa phù hợp.",
      _form: "Payload không hợp lệ.",
    });
    expect(mapFieldErrors(null)).toEqual({});
  });

  it("validates required duration values with the exact Vietnamese messages", () => {
    const validCases = ["1", "14", " 3 ", "007"];
    for (const durationDays of validCases) {
      expect(validateRequiredFields(fields({ durationDays })), durationDays).toEqual({});
    }

    expect(validateRequiredFields(fields({ durationDays: "" })).durationDays).toBe(
      "Vui lòng nhập thời lượng chuyến đi (số ngày).",
    );
    expect(validateRequiredFields(fields({ durationDays: " " })).durationDays).toBe(
      "Vui lòng nhập thời lượng chuyến đi (số ngày).",
    );
    expect(validateRequiredFields(fields({ durationDays: null })).durationDays).toBe(
      "Vui lòng nhập thời lượng chuyến đi (số ngày).",
    );

    const integerErrors = ["-1", "-3", "+2", "2.5", "abc", "1e1", "١٢", "１２", "2 ngày"];
    for (const durationDays of integerErrors) {
      expect(validateRequiredFields(fields({ durationDays })).durationDays, durationDays).toBe(
        "Thời lượng phải là số nguyên (ví dụ: 3).",
      );
    }
    expect(validateRequiredFields(fields({ durationDays: "0" })).durationDays).toBe(
      "Thời lượng tối thiểu là 1 ngày.",
    );
    expect(validateRequiredFields(fields({ durationDays: "15" })).durationDays).toBe(
      "Thời lượng tối đa là 14 ngày.",
    );
    expect(validateRequiredFields(fields({ durationDays: "999999999999999999999" })).durationDays).toBe(
      "Thời lượng tối đa là 14 ngày.",
    );
  });

  it("validates transport without silently replacing an invalid value", () => {
    expect(validateRequiredFields(fields({ transport: "MOTORCYCLE" }))).toEqual({});
    expect(validateRequiredFields(fields({ transport: "CAR" }))).toEqual({});
    expect(validateRequiredFields(fields({ transport: "" })).transport).toBe(
      "Vui lòng chọn phương tiện: xe máy hoặc ô tô.",
    );
    expect(validateRequiredFields(fields({ transport: null })).transport).toBe(
      "Vui lòng chọn phương tiện: xe máy hoặc ô tô.",
    );
    for (const transport of ["BICYCLE", "car", "unknown"]) {
      expect(validateRequiredFields(fields({ transport })).transport, transport).toBe(
        "Hiện chỉ hỗ trợ xe máy hoặc ô tô. Vui lòng chọn lại.",
      );
    }
  });

  it("returns both required errors in focus order and keeps optional blanks non-blocking", () => {
    const errors = validateRequiredFields(fields({ durationDays: "", transport: "" }));
    expect(Object.keys(errors)).toEqual(["durationDays", "transport"]);
    expect(errors).toEqual({
      durationDays: "Vui lòng nhập thời lượng chuyến đi (số ngày).",
      transport: "Vui lòng chọn phương tiện: xe máy hoặc ô tô.",
    });
    expect(validateRequiredFields(fields({
      startDate: "",
      companionType: "",
      companionGroupSize: "",
      interests: [],
      pace: "",
      mobilityFlags: [],
      mobilityNote: "",
    }))).toEqual({});
  });

  it("reports optional contract errors after required fields pass", () => {
    expect(validateRequiredFields(fields({ companionType: "COUPLE", companionGroupSize: "21" }))).toEqual({
      "companions.groupSize": "Số người đi cùng phải từ 1 đến 20.",
    });
    expect(validateRequiredFields(fields({ mobilityNote: "x".repeat(501) }))).toEqual({
      "mobilityConstraints.note": "Ghi chú di chuyển không được quá 500 ký tự.",
    });
  });

  it("keeps client validation consistent with the shared contract schema", () => {
    for (const durationDays of ["1", "14", " 3 ", "007"]) {
      for (const transport of ["MOTORCYCLE", "CAR"]) {
        const input = fields({ durationDays, transport });
        expect(validateRequiredFields(input), `${durationDays}/${transport}`).toEqual({});
        expect(tripRequirementInputSchema.safeParse(buildPayload(input)).success).toBe(true);
      }
    }
  });

  it("keeps validation data and maps success, auth, forbidden, server and network outcomes", () => {
    const readiness = {
      preliminary: true,
      finalConfirmation: false,
      missing: ["startDate"],
      startDateIssue: "MISSING",
      usesRelativeDays: true,
    } as const;
    const requirement = {
      startDate: null,
      durationDays: 3,
      transport: "CAR",
      companions: null,
      interests: [],
      pace: null,
      mobilityConstraints: null,
    } as const;

    expect(
      decideEvaluateResponse({ kind: "http", status: 200, body: { success: true, data: { requirement, readiness } } }),
    ).toEqual({ action: "SUCCESS", data: { requirement, readiness } });
    expect(
      decideEvaluateResponse({
        kind: "http",
        status: 400,
        body: {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Kiểm tra lại.",
            details: { fieldErrors: { durationDays: "Thiếu số ngày." } },
          },
        },
      }),
    ).toEqual({
      action: "VALIDATION_ERROR",
      fieldErrors: { durationDays: "Thiếu số ngày." },
      message: "Kiểm tra lại.",
    });
    expect(decideEvaluateResponse({ kind: "http", status: 401, body: {} }).action).toBe("LOGIN");
    expect(decideEvaluateResponse({ kind: "http", status: 403, body: {} }).action).toBe("FORBIDDEN");
    expect(decideEvaluateResponse({ kind: "http", status: 503, body: {} }).action).toBe("TECHNICAL_ERROR");
    expect(decideEvaluateResponse({ kind: "network" }).action).toBe("NETWORK_ERROR");
  });

  it("exposes a disabled busy submit state only while pending", () => {
    expect(getSubmitButtonState(false)).toEqual({
      disabled: false,
      ariaBusy: false,
      label: "Xem lại và tạo lịch trình",
    });
    expect(getSubmitButtonState(true)).toEqual({
      disabled: true,
      ariaBusy: true,
      label: "Đang xem lại…",
    });
  });

  describe("decideSubmitRouting (PO Decision 2026-10-24)", () => {
    it("routes directly to planner for valid manual form entry without AI", () => {
      const decision = decideSubmitRouting({
        hasUnreviewedAiAssignments: false,
        confirmable: true,
        clarificationRequestsCount: 0,
      });
      expect(decision).toEqual({ action: "PROCEED_TO_PLANNER" });
    });

    it("opens review dialog when unreviewed AI fields remain", () => {
      const decision = decideSubmitRouting({
        hasUnreviewedAiAssignments: true,
        confirmable: true,
        clarificationRequestsCount: 0,
      });
      expect(decision).toEqual({ action: "OPEN_REVIEW", initialEditingKey: null });
    });

    it("routes directly to planner if user dismissed/unassigned all AI fields", () => {
      const decision = decideSubmitRouting({
        hasUnreviewedAiAssignments: false,
        confirmable: true,
        clarificationRequestsCount: 0,
      });
      expect(decision).toEqual({ action: "PROCEED_TO_PLANNER" });
    });

    it("opens review dialog at the error field when server check fails", () => {
      const decision = decideSubmitRouting({
        hasUnreviewedAiAssignments: false,
        confirmable: false,
        clarificationRequestsCount: 0,
        firstErrorField: "durationDays",
      });
      expect(decision).toEqual({
        action: "OPEN_REVIEW",
        initialEditingKey: "durationDays",
      });
    });

    it("opens review dialog when server requires clarifications", () => {
      const decision = decideSubmitRouting({
        hasUnreviewedAiAssignments: false,
        confirmable: true,
        clarificationRequestsCount: 2,
      });
      expect(decision).toEqual({ action: "OPEN_REVIEW", initialEditingKey: null });
    });

    it("nhập bằng biểu mẫu hợp lệ thì đi thẳng sang đề xuất (bypasses review dialog)", () => {
      const decision = decideSubmitRouting({
        hasUnreviewedAiAssignments: false,
        confirmable: true,
        clarificationRequestsCount: 0,
      });
      expect(decision).toEqual({ action: "PROCEED_TO_PLANNER" });
    });

    it("có trường AI chưa bỏ gán thì mở hộp thoại xem lại", () => {
      const decision = decideSubmitRouting({
        hasUnreviewedAiAssignments: true,
        confirmable: true,
        clarificationRequestsCount: 0,
      });
      expect(decision).toEqual({ action: "OPEN_REVIEW", initialEditingKey: null });
    });

    it("máy chủ không xác nhận thì mở hộp thoại ở đúng ô lỗi", () => {
      const decision = decideSubmitRouting({
        hasUnreviewedAiAssignments: false,
        confirmable: false,
        clarificationRequestsCount: 0,
        firstErrorField: "transport",
      });
      expect(decision).toEqual({
        action: "OPEN_REVIEW",
        initialEditingKey: "transport",
      });
    });

    it("bỏ gán hết các trường AI rồi gửi thì coi như nhập biểu mẫu (đi thẳng)", () => {
      const decision = decideSubmitRouting({
        hasUnreviewedAiAssignments: false,
        confirmable: true,
        clarificationRequestsCount: 0,
      });
      expect(decision).toEqual({ action: "PROCEED_TO_PLANNER" });
    });

    it("lỗi mạng thì ở lại biểu mẫu và cho phép thử lại (NETWORK_ERROR)", () => {
      const responseDecision = decideEvaluateResponse({ kind: "network" });
      expect(responseDecision.action).toBe("NETWORK_ERROR");
    });

    it("bấm đúp chỉ gửi một lần (submission lock / pending state)", () => {
      const pendingState = getSubmitButtonState(true);
      expect(pendingState.disabled).toBe(true);
      expect(pendingState.ariaBusy).toBe(true);
    });

    it("đóng hoặc rời trang giữa chừng thì hủy hoặc bỏ qua kết quả yêu cầu", () => {
      expect(shouldApplyRequestResponse(1, 1, false)).toBe(false);
      expect(shouldApplyRequestResponse(1, 2, true)).toBe(false);
      expect(shouldApplyRequestResponse(2, 2, true)).toBe(true);
    });
  });
});
