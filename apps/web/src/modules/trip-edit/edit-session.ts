import {
  addVisit,
  editCandidateSchema,
  moveVisit,
  removeVisit,
  setVisitDuration,
  setVisitTime,
  type EditCandidate,
  type NewEditCandidateVisit,
} from "./edit-candidate";

export type EditSession = {
  candidate: EditCandidate;
};

export class EditSessionInputError extends Error {
  constructor(readonly code: "TIME_FORMAT_INVALID" | "DURATION_INVALID", message: string) {
    super(message);
    this.name = "EditSessionInputError";
  }
}

export function createEditSession(candidate: EditCandidate): EditSession {
  return { candidate: editCandidateSchema.parse(candidate) };
}

export function addVisitToEditSession(
  session: EditSession,
  dayIndex: number,
  visit: NewEditCandidateVisit,
  position?: number,
): EditSession {
  return {
    candidate: addVisit(session.candidate, dayIndex, visit, position),
  };
}

export function removeVisitFromEditSession(
  session: EditSession,
  visitId: string,
): EditSession {
  return {
    candidate: removeVisit(session.candidate, visitId),
  };
}

function findVisitLocation(session: EditSession, visitId: string) {
  for (const day of session.candidate.days) {
    const visitIndex = day.visits.findIndex((visit) => visit.visitId === visitId);
    if (visitIndex !== -1) return { dayIndex: day.dayIndex, visitIndex };
  }
  throw new Error("Không tìm thấy điểm đến trong phương án.");
}

export function moveVisitUpInEditSession(session: EditSession, visitId: string): EditSession {
  const { dayIndex, visitIndex } = findVisitLocation(session, visitId);
  if (visitIndex === 0) return session;
  return { candidate: moveVisit(session.candidate, visitId, dayIndex, visitIndex) };
}

export function moveVisitDownInEditSession(session: EditSession, visitId: string): EditSession {
  const { dayIndex, visitIndex } = findVisitLocation(session, visitId);
  const day = session.candidate.days.find((item) => item.dayIndex === dayIndex)!;
  if (visitIndex === day.visits.length - 1) return session;
  return { candidate: moveVisit(session.candidate, visitId, dayIndex, visitIndex + 2) };
}

export function moveVisitToDayInEditSession(
  session: EditSession,
  visitId: string,
  targetDayIndex: number,
): EditSession {
  return { candidate: moveVisit(session.candidate, visitId, targetDayIndex) };
}

function parseStartMinute(value: string): number {
  const match = /^(?:[01]\d|2[0-3]):[0-5]\d$/.exec(value);
  if (!match) {
    throw new EditSessionInputError("TIME_FORMAT_INVALID", "Giờ bắt đầu phải theo định dạng HH:mm.");
  }
  const [hour, minute] = value.split(":").map(Number);
  return hour! * 60 + minute!;
}

export function setVisitTimeInEditSession(
  session: EditSession,
  visitId: string,
  startTime: string,
): EditSession {
  return { candidate: setVisitTime(session.candidate, visitId, parseStartMinute(startTime)) };
}

export function setVisitDurationInEditSession(
  session: EditSession,
  visitId: string,
  durationInput: string,
): EditSession {
  const duration = durationInput.trim() === "" ? Number.NaN : Number(durationInput);
  if (!Number.isInteger(duration) || duration <= 0) {
    throw new EditSessionInputError("DURATION_INVALID", "Thời lượng phải là số phút nguyên lớn hơn 0.");
  }
  return { candidate: setVisitDuration(session.candidate, visitId, duration) };
}
