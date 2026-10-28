import type { Database, Prisma } from "@KLTN/db";

import { requireTraveler } from "@/server/auth/require-traveler";
import type { AuthorizationDependencies } from "@/server/authorization/guard";
import { AppError } from "@/server/http/app-error";
import { effectiveTripStatus, type TripStatus } from "./trip-status";
import type { TravelLeg } from "../trip-planner/planner-contract";

export type TripReadDependencies = AuthorizationDependencies & { database: Database };

export type TripSummary = {
  id: string;
  startDate: string;
  endDate: string;
  durationDays: number;
  transport: "CAR" | "MOTORCYCLE";
  status: TripStatus;
  manuallyCompletedAt: string | null;
  isFavorite: boolean;
  visitCount: number;
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
      destination: {
        id: string;
        name: string;
        area: string;
        category?: string;
        latitude?: number;
        longitude?: number;
        address?: string | null;
        description?: string;
        visibility: "VISIBLE" | "HIDDEN";
        availability: "AVAILABLE" | "UNAVAILABLE";
      };
      inbound?: TravelLeg | null;
    }[];
  }[];
};

const summarySelect = (userId: string) => ({
  id: true, startDate: true, durationDays: true, transport: true, manuallyCompletedAt: true,
  favorites: { where: { userId }, select: { id: true } },
  days: { select: { _count: { select: { visits: true } } } },
} satisfies Prisma.TripSelect);
const detailSelect = (userId: string) => ({
  id: true, startDate: true, durationDays: true, transport: true, manuallyCompletedAt: true,
  favorites: { where: { userId }, select: { id: true } },
  days: {
    orderBy: [{ dayIndex: "asc" as const }, { id: "asc" as const }],
    select: {
      id: true, dayIndex: true, localDate: true,
      _count: { select: { visits: true } },
      visits: {
        orderBy: [{ order: "asc" as const }, { id: "asc" as const }],
        select: {
          id: true, order: true, startMinute: true, plannedDurationMinutes: true,
          destination: {
            select: {
              id: true,
              name: true,
              area: true,
              category: true,
              latitude: true,
              longitude: true,
              address: true,
              description: true,
              visibility: true,
              deletedAt: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.TripSelect);

type SummaryRow = {
  id: string;
  startDate: Date;
  manuallyCompletedAt: Date | null;
  durationDays: number;
  transport: "CAR" | "MOTORCYCLE";
  favorites: { id: string }[];
  days: { _count: { visits: number } }[];
};

function summary(row: SummaryRow, referenceDate: string): TripSummary {
  const startDate = row.startDate.toISOString().slice(0, 10);
  return {
    id: row.id,
    startDate,
    durationDays: row.durationDays,
    transport: row.transport,
    manuallyCompletedAt: row.manuallyCompletedAt?.toISOString() ?? null,
    isFavorite: row.favorites.length > 0,
    visitCount: row.days.reduce((total, day) => total + day._count.visits, 0),
    ...effectiveTripStatus(startDate, row.durationDays, referenceDate, row.manuallyCompletedAt),
  };
}

export async function listMyTrips(headers: Headers, deps: TripReadDependencies, referenceDate: string): Promise<{ items: TripSummary[] }> {
  const actor = await requireTraveler(headers, deps);
  const rows = await deps.database.trip.findMany({
    where: { userId: actor.userId },
    orderBy: [{ startDate: "asc" }, { id: "asc" }],
    select: summarySelect(actor.userId),
  });
  return { items: rows.map(row => summary(row, referenceDate)) };
}

export async function getMyTrip(headers: Headers, id: string, deps: TripReadDependencies, referenceDate: string): Promise<TripDetail> {
  const actor = await requireTraveler(headers, deps);
  const row = await deps.database.trip.findFirst({ where: { id, userId: actor.userId }, select: detailSelect(actor.userId) });
  if (!row) throw new AppError("TRIP_NOT_FOUND", "Không tìm thấy chuyến đi.", 404);
  return {
    ...summary(row, referenceDate),
    days: [...row.days].sort((a, b) => a.dayIndex - b.dayIndex || a.id.localeCompare(b.id)).map(day => ({
      id: day.id, dayIndex: day.dayIndex, localDate: day.localDate.toISOString().slice(0, 10),
      visits: [...day.visits].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)).map(visit => ({
        id: visit.id, order: visit.order, startMinute: visit.startMinute,
        plannedDurationMinutes: visit.plannedDurationMinutes,
        destination: {
          id: visit.destination.id,
          name: visit.destination.name,
          area: visit.destination.area,
          category: (visit.destination as { category?: string }).category,
          latitude: (visit.destination as { latitude?: number }).latitude,
          longitude: (visit.destination as { longitude?: number }).longitude,
          address: (visit.destination as { address?: string | null }).address ?? null,
          description: (visit.destination as { description?: string }).description,
          visibility: visit.destination.visibility,
          availability: visit.destination.visibility === "VISIBLE" && !visit.destination.deletedAt ? "AVAILABLE" : "UNAVAILABLE",
        },
      })),
    })),
  };
}
