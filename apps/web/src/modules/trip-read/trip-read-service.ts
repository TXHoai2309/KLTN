import type { Database, Prisma } from "@KLTN/db";

import { requireTraveler } from "@/server/auth/require-traveler";
import type { AuthorizationDependencies } from "@/server/authorization/guard";
import { AppError } from "@/server/http/app-error";
import { deriveTripStatus, type TripStatus } from "./trip-status";

export type TripReadDependencies = AuthorizationDependencies & { database: Database };

export type TripSummary = {
  id: string;
  startDate: string;
  endDate: string;
  durationDays: number;
  transport: "CAR" | "MOTORCYCLE";
  status: TripStatus;
};

export type TripDetail = TripSummary & {
  days: {
    id: string;
    dayIndex: number;
    localDate: string;
    visits: {
      id: string;
      order: number;
      startMinute: number;
      plannedDurationMinutes: number;
      destination: { id: string; name: string; area: string; visibility: "VISIBLE" | "HIDDEN" };
    }[];
  }[];
};

const summarySelect = { id: true, startDate: true, durationDays: true, transport: true } satisfies Prisma.TripSelect;
const detailSelect = {
  ...summarySelect,
  days: {
    orderBy: [{ dayIndex: "asc" as const }, { id: "asc" as const }],
    select: {
      id: true, dayIndex: true, localDate: true,
      visits: {
        orderBy: [{ order: "asc" as const }, { id: "asc" as const }],
        select: {
          id: true, order: true, startMinute: true, plannedDurationMinutes: true,
          destination: { select: { id: true, name: true, area: true, visibility: true } },
        },
      },
    },
  },
} satisfies Prisma.TripSelect;

function summary(row: Prisma.TripGetPayload<{ select: typeof summarySelect }>, referenceDate: string): TripSummary {
  const startDate = row.startDate.toISOString().slice(0, 10);
  return { id: row.id, startDate, durationDays: row.durationDays, transport: row.transport, ...deriveTripStatus(startDate, row.durationDays, referenceDate) };
}

export async function listMyTrips(headers: Headers, deps: TripReadDependencies, referenceDate: string): Promise<{ items: TripSummary[] }> {
  const actor = await requireTraveler(headers, deps);
  const rows = await deps.database.trip.findMany({
    where: { userId: actor.userId },
    orderBy: [{ startDate: "asc" }, { id: "asc" }],
    select: summarySelect,
  });
  return { items: rows.map(row => summary(row, referenceDate)) };
}

export async function getMyTrip(headers: Headers, id: string, deps: TripReadDependencies, referenceDate: string): Promise<TripDetail> {
  const actor = await requireTraveler(headers, deps);
  const row = await deps.database.trip.findFirst({ where: { id, userId: actor.userId }, select: detailSelect });
  if (!row) throw new AppError("TRIP_NOT_FOUND", "Không tìm thấy chuyến đi.", 404);
  return {
    ...summary(row, referenceDate),
    days: [...row.days].sort((a, b) => a.dayIndex - b.dayIndex || a.id.localeCompare(b.id)).map(day => ({
      id: day.id, dayIndex: day.dayIndex, localDate: day.localDate.toISOString().slice(0, 10),
      visits: [...day.visits].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)).map(visit => ({
        id: visit.id, order: visit.order, startMinute: visit.startMinute,
        plannedDurationMinutes: visit.plannedDurationMinutes,
        destination: visit.destination,
      })),
    })),
  };
}
