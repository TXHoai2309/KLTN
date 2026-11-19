import { expect, it } from "vitest";
import { validateRequiredFields } from "./trip-requirement-form-logic";
import { checkTripRequirement } from "./trip-requirement-check";

const fields = { startDate: "2026-11-19", durationDays: "3", transport: "CAR", companionType: "SOLO", companionGroupSize: "1", interests: ["NATURE"], pace: "RELAXED", mobilityFlags: [], mobilityNote: "Giữ nguyên ghi chú" };
const beforeMidnight = new Date("2026-11-19T16:59:59Z");
const afterMidnight = new Date("2026-11-19T17:00:00Z");

it("rejects yesterday but accepts today/future at the creation client gate", () => {
  expect(validateRequiredFields({ ...fields, startDate: "2026-11-18" }, beforeMidnight).startDate).toContain("Ngày khởi hành");
  expect(validateRequiredFields(fields, beforeMidnight)).toEqual({});
  expect(validateRequiredFields({ ...fields, startDate: "2026-11-20" }, beforeMidnight)).toEqual({});
});
it("rechecks Vietnam midnight without changing the user's input", () => {
  const snapshot = structuredClone(fields);
  expect(validateRequiredFields(fields, beforeMidnight)).toEqual({});
  expect(validateRequiredFields(fields, afterMidnight).startDate).toContain("Ngày khởi hành");
  expect(fields).toEqual(snapshot);
});
it("server check rejects a direct past-date candidate at the same Vietnam boundary", () => {
  const candidate = { startDate: fields.startDate, durationDays: 3, transport: "CAR" };
  expect(checkTripRequirement(candidate, beforeMidnight).confirmable).toBe(true);
  const result = checkTripRequirement(candidate, afterMidnight);
  expect(result.confirmable).toBe(false);
  expect(result.issues).toContainEqual(expect.objectContaining({ code: "START_DATE_IN_PAST", field: "startDate", severity: "ERROR" }));
});
