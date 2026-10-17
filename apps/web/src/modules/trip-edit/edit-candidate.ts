import { z } from "zod";

import {
  isValidCalendarDate,
  MAX_DURATION_DAYS,
  TRANSPORT_VALUES,
} from "../trip-requirement/trip-requirement-contract";

/** Matches the current Planner itinerary contract's maximum of four visits per day. */
export const MAX_EDIT_VISITS_PER_DAY = 4;
/** Matches the persisted trip proposal contract. */
export const MAX_EDIT_VISITS = 50;

const visitSchema = z
  .object({
    visitId: z.string().min(1).max(128),
    destinationId: z.string().min(1).max(128),
    startMinute: z.number().int().min(0).max(1439),
    plannedDurationMinutes: z.number().int().min(1).max(1440),
    order: z.number().int().min(1).max(MAX_EDIT_VISITS_PER_DAY),
  })
  .strict()
  .refine(
    (visit) => visit.startMinute + visit.plannedDurationMinutes <= 1440,
    "Lượt tham quan phải nằm trong một ngày.",
  );

const daySchema = z
  .object({
    dayIndex: z.number().int().min(1).max(MAX_DURATION_DAYS),
    visits: z.array(visitSchema).max(MAX_EDIT_VISITS_PER_DAY),
  })
  .strict();

export const editCandidateSchema = z
  .object({
    startDate: z
      .string()
      .refine(isValidCalendarDate, "Ngày bắt đầu không hợp lệ.")
      .nullable(),
    durationDays: z.number().int().min(1).max(MAX_DURATION_DAYS),
    transport: z.enum(TRANSPORT_VALUES),
    days: z.array(daySchema).min(1).max(MAX_DURATION_DAYS),
  })
  .strict()
  .superRefine((candidate, context) => {
    if (
      candidate.days.length !== candidate.durationDays ||
      candidate.days.some((day, index) => day.dayIndex !== index + 1)
    ) {
      context.addIssue({
        code: "custom",
        path: ["days"],
        message: "Các ngày phải liên tiếp từ ngày 1 đến hết chuyến đi.",
      });
    }

    const visitIds = new Set<string>();
    let visitCount = 0;
    candidate.days.forEach((day, dayIndex) => {
      day.visits.forEach((visit, visitIndex) => {
        visitCount += 1;
        if (visitIds.has(visit.visitId)) {
          context.addIssue({
            code: "custom",
            path: ["days", dayIndex, "visits", visitIndex, "visitId"],
            message: "Mã lượt tham quan phải là duy nhất trong hành trình.",
          });
        }
        visitIds.add(visit.visitId);

        if (visit.order !== visitIndex + 1) {
          context.addIssue({
            code: "custom",
            path: ["days", dayIndex, "visits", visitIndex, "order"],
            message: "Thứ tự lượt tham quan phải liên tiếp từ 1.",
          });
        }
      });
    });

    if (visitCount > MAX_EDIT_VISITS) {
      context.addIssue({
        code: "custom",
        path: ["days"],
        message: "Phương án có quá nhiều lượt tham quan để kiểm tra trong một lần.",
      });
    }
  });

export type EditCandidate = z.infer<typeof editCandidateSchema>;
export type EditCandidateVisit = EditCandidate["days"][number]["visits"][number];
export type NewEditCandidateVisit = Omit<EditCandidateVisit, "order">;
export type EditCandidateVisitFields = Pick<
  EditCandidateVisit,
  "destinationId" | "startMinute" | "plannedDurationMinutes"
>;

export type SavedTripForEdit = {
  startDate: Date | string;
  durationDays: number;
  transport: EditCandidate["transport"];
  days: readonly {
    dayIndex: number;
    visits: readonly {
      id: string;
      destinationId: string;
      startMinute: number;
      plannedDurationMinutes: number;
      order: number;
    }[];
  }[];
};

export class EditCandidateOperationError extends Error {
  constructor(
    readonly code:
      | "DAY_NOT_FOUND"
      | "VISIT_NOT_FOUND"
      | "VISIT_ID_CONFLICT"
      | "VISIT_LIMIT_EXCEEDED"
      | "POSITION_INVALID",
    message: string,
  ) {
    super(message);
    this.name = "EditCandidateOperationError";
  }
}

const newVisitSchema = z
  .object({
    visitId: z.string().min(1).max(128),
    destinationId: z.string().min(1).max(128),
    startMinute: z.number().int().min(0).max(1439),
    plannedDurationMinutes: z.number().int().min(1).max(1440),
  })
  .strict()
  .refine(
    (visit) => visit.startMinute + visit.plannedDurationMinutes <= 1440,
    "Lượt tham quan phải nằm trong một ngày.",
  );
const replacementSchema = z
  .object({
    destinationId: z.string().min(1).max(128),
    startMinute: z.number().int().min(0).max(1439),
    plannedDurationMinutes: z.number().int().min(1).max(1440),
  })
  .strict()
  .refine(
    (visit) => visit.startMinute + visit.plannedDurationMinutes <= 1440,
    "Lượt tham quan phải nằm trong một ngày.",
  );

function copyCandidate(candidate: EditCandidate): EditCandidate {
  const parsed = editCandidateSchema.parse(candidate);
  return {
    startDate: parsed.startDate,
    durationDays: parsed.durationDays,
    transport: parsed.transport,
    days: parsed.days.map((day) => ({
      dayIndex: day.dayIndex,
      visits: day.visits.map((visit) => ({ ...visit })),
    })),
  };
}

function finishCandidate(candidate: EditCandidate): EditCandidate {
  return editCandidateSchema.parse(candidate);
}

function renumberDay(day: EditCandidate["days"][number]): void {
  day.visits.forEach((visit, index) => {
    visit.order = index + 1;
  });
}

function findDay(candidate: EditCandidate, dayIndex: number) {
  const day = candidate.days.find((item) => item.dayIndex === dayIndex);
  if (!day) {
    throw new EditCandidateOperationError(
      "DAY_NOT_FOUND",
      `Không tìm thấy ngày ${dayIndex} trong phương án.`,
    );
  }
  return day;
}

function findVisit(candidate: EditCandidate, visitId: string) {
  for (const day of candidate.days) {
    const visitIndex = day.visits.findIndex((visit) => visit.visitId === visitId);
    if (visitIndex !== -1) return { day, visit: day.visits[visitIndex]!, visitIndex };
  }
  throw new EditCandidateOperationError(
    "VISIT_NOT_FOUND",
    `Không tìm thấy lượt ${visitId} trong phương án.`,
  );
}

function parsePosition(position: number, max: number): number {
  const parsed = z.number().int().min(1).max(max).safeParse(position);
  if (!parsed.success) {
    throw new EditCandidateOperationError(
      "POSITION_INVALID",
      "Vị trí chèn phải nằm trong ngày đích.",
    );
  }
  return parsed.data;
}

/** Convert the persisted Trip graph to the save-contract itinerary shape plus stable visit IDs. */
export function createEditCandidate(trip: SavedTripForEdit): EditCandidate {
  const startDate =
    trip.startDate instanceof Date
      ? Number.isNaN(trip.startDate.getTime())
        ? ""
        : trip.startDate.toISOString().slice(0, 10)
      : trip.startDate;

  return editCandidateSchema.parse({
    startDate,
    durationDays: trip.durationDays,
    transport: trip.transport,
    days: [...trip.days]
      .sort((left, right) => left.dayIndex - right.dayIndex)
      .map((day) => ({
        dayIndex: day.dayIndex,
        visits: [...day.visits]
          .sort((left, right) => left.order - right.order)
          .map((visit) => ({
            visitId: visit.id,
            destinationId: visit.destinationId,
            startMinute: visit.startMinute,
            plannedDurationMinutes: visit.plannedDurationMinutes,
            order: visit.order,
          })),
      })),
  });
}

/** Add a visit using only its stable candidate ID and destination ID, never a Destination object. */
export function addVisit(
  source: EditCandidate,
  dayIndex: number,
  input: NewEditCandidateVisit,
  position?: number,
): EditCandidate {
  const candidate = copyCandidate(source);
  const day = findDay(candidate, dayIndex);
  if (candidate.days.some((item) => item.visits.some((visit) => visit.visitId === input.visitId))) {
    throw new EditCandidateOperationError(
      "VISIT_ID_CONFLICT",
      "Mã lượt tham quan đã tồn tại trong phương án.",
    );
  }
  if (day.visits.length >= MAX_EDIT_VISITS_PER_DAY) {
    throw new EditCandidateOperationError(
      "VISIT_LIMIT_EXCEEDED",
      `Mỗi ngày chỉ hỗ trợ tối đa ${MAX_EDIT_VISITS_PER_DAY} lượt tham quan.`,
    );
  }

  const visit = newVisitSchema.parse(input);
  const targetPosition = parsePosition(position ?? day.visits.length + 1, day.visits.length + 1);
  day.visits.splice(targetPosition - 1, 0, { ...visit, order: targetPosition });
  renumberDay(day);
  return finishCandidate(candidate);
}

export function removeVisit(source: EditCandidate, visitId: string): EditCandidate {
  const candidate = copyCandidate(source);
  const { day, visitIndex } = findVisit(candidate, visitId);
  day.visits.splice(visitIndex, 1);
  renumberDay(day);
  return finishCandidate(candidate);
}

/** Move a visit to a 1-based position in its target day; omitted position appends it. */
export function moveVisit(
  source: EditCandidate,
  visitId: string,
  targetDayIndex: number,
  position?: number,
): EditCandidate {
  const candidate = copyCandidate(source);
  const sourceLocation = findVisit(candidate, visitId);
  const targetDay = findDay(candidate, targetDayIndex);
  sourceLocation.day.visits.splice(sourceLocation.visitIndex, 1);

  if (targetDay.visits.length >= MAX_EDIT_VISITS_PER_DAY) {
    throw new EditCandidateOperationError(
      "VISIT_LIMIT_EXCEEDED",
      `Mỗi ngày chỉ hỗ trợ tối đa ${MAX_EDIT_VISITS_PER_DAY} lượt tham quan.`,
    );
  }

  const targetPosition = parsePosition(position ?? targetDay.visits.length + 1, targetDay.visits.length + 1);
  targetDay.visits.splice(targetPosition - 1, 0, sourceLocation.visit);
  renumberDay(sourceLocation.day);
  if (sourceLocation.day !== targetDay) renumberDay(targetDay);
  return finishCandidate(candidate);
}

export function setVisitTime(
  source: EditCandidate,
  visitId: string,
  startMinute: number,
): EditCandidate {
  const candidate = copyCandidate(source);
  const { visit } = findVisit(candidate, visitId);
  visit.startMinute = z.number().int().min(0).max(1439).parse(startMinute);
  return finishCandidate(candidate);
}

export function setVisitDuration(
  source: EditCandidate,
  visitId: string,
  plannedDurationMinutes: number,
): EditCandidate {
  const candidate = copyCandidate(source);
  const { visit } = findVisit(candidate, visitId);
  visit.plannedDurationMinutes = z
    .number()
    .int()
    .min(1)
    .max(1440)
    .parse(plannedDurationMinutes);
  return finishCandidate(candidate);
}

/** Replace editable visit data while preserving visitId and its current order/day. */
export function replaceVisit(
  source: EditCandidate,
  visitId: string,
  replacement: EditCandidateVisitFields,
): EditCandidate {
  const candidate = copyCandidate(source);
  const { day, visitIndex, visit } = findVisit(candidate, visitId);
  day.visits[visitIndex] = {
    visitId: visit.visitId,
    ...replacementSchema.parse(replacement),
    order: visit.order,
  };
  return finishCandidate(candidate);
}

export type PositionedEditCandidateVisit = EditCandidateVisit & { dayIndex: number };
export type EditCandidateChangedField =
  | "dayIndex"
  | "order"
  | "destinationId"
  | "startMinute"
  | "plannedDurationMinutes";

export type EditCandidateDiff = {
  added: PositionedEditCandidateVisit[];
  removed: PositionedEditCandidateVisit[];
  updated: {
    visitId: string;
    before: PositionedEditCandidateVisit;
    after: PositionedEditCandidateVisit;
    changedFields: EditCandidateChangedField[];
  }[];
  tripChanges: {
    startDate?: { before: string | null; after: string | null };
    durationDays?: { before: number; after: number };
    transport?: { before: EditCandidate["transport"]; after: EditCandidate["transport"] };
  };
};

function positionedVisits(candidate: EditCandidate): PositionedEditCandidateVisit[] {
  return candidate.days.flatMap((day) =>
    day.visits.map((visit) => ({ ...visit, dayIndex: day.dayIndex })),
  );
}

/** Return stable-ID additions, removals, visit edits, moves and trip-level changes. */
export function diffEditCandidate(
  original: EditCandidate,
  candidate: EditCandidate,
): EditCandidateDiff {
  const base = editCandidateSchema.parse(original);
  const next = editCandidateSchema.parse(candidate);
  const beforeVisits = positionedVisits(base);
  const afterVisits = positionedVisits(next);
  const beforeById = new Map(beforeVisits.map((visit) => [visit.visitId, visit]));
  const afterById = new Map(afterVisits.map((visit) => [visit.visitId, visit]));

  const added = afterVisits.filter((visit) => !beforeById.has(visit.visitId));
  const removed = beforeVisits.filter((visit) => !afterById.has(visit.visitId));
  const fields: EditCandidateChangedField[] = [
    "dayIndex",
    "order",
    "destinationId",
    "startMinute",
    "plannedDurationMinutes",
  ];
  const updated = beforeVisits.flatMap((before) => {
    const after = afterById.get(before.visitId);
    if (!after) return [];
    const changedFields = fields.filter((field) => before[field] !== after[field]);
    return changedFields.length
      ? [{ visitId: before.visitId, before, after, changedFields }]
      : [];
  });

  const tripChanges: EditCandidateDiff["tripChanges"] = {};
  if (base.startDate !== next.startDate) {
    tripChanges.startDate = { before: base.startDate, after: next.startDate };
  }
  if (base.durationDays !== next.durationDays) {
    tripChanges.durationDays = { before: base.durationDays, after: next.durationDays };
  }
  if (base.transport !== next.transport) {
    tripChanges.transport = { before: base.transport, after: next.transport };
  }

  return { added, removed, updated, tripChanges };
}
