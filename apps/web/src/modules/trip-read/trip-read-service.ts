import type { Database, Prisma } from "@KLTN/db";

import { requireTraveler } from "@/server/auth/require-traveler";
import type { AuthorizationDependencies } from "@/server/authorization/guard";
import { AppError } from "@/server/http/app-error";
import { effectiveTripStatus, type TripStatus } from "./trip-status";
import type { TravelLeg } from "../trip-planner/planner-contract";
import { savedJourneySchema, journeyVisitFingerprint, type SavedJourney } from "../trip-origin/journey-saved-contract";
import { externalPlaceView } from "./external-place-cache";
import { storedUncheckedSchema, type UncheckedItem } from "../trip-save/unchecked-checks";

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
  role?: "HOST" | "MEMBER";
  publicationId?: string | null;
  companionTitle?: string | null;
  hostName?: string | null;
};

export type TripDetail = TripSummary & {
  /** Only HOST receives this property; legacy owner reads explicitly return null. */
  journey?: SavedJourney | null;
  /** Owner only: checks the Trip was saved with as UNCHECKED (never PASS). Absent when nothing was unchecked. */
  unchecked?: { items: UncheckedItem[]; confirmedAt: string | null };
  baseRevision?: string;
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
        /** A place outside the KLTN catalogue: no destination page; name/coordinates are a 30-day cache. */
        external?: true;
      };
      inbound?: TravelLeg | null;
    }[];
  }[];
};

const summarySelect = (userId: string) => ({
  id: true, userId: true, startDate: true, durationDays: true, transport: true, manuallyCompletedAt: true,
  user: { select: { name: true } },
  favorites: { where: { userId }, select: { id: true } },
  days: { select: { _count: { select: { visits: true } } } },
  companionPublication: {
    select: {
      id: true,
      title: true,
    },
  },
} satisfies Prisma.TripSelect);
const detailSelect = (userId: string) => ({
  journeySnapshot: true,
  uncheckedChecks: true,
  uncheckedConfirmedAt: true,
  updatedAt: true,
  id: true, userId: true, startDate: true, durationDays: true, transport: true, manuallyCompletedAt: true,
  user: { select: { name: true } },
  favorites: { where: { userId }, select: { id: true } },
  companionPublication: {
    select: {
      id: true,
      title: true,
    },
  },
  days: {
    orderBy: [{ dayIndex: "asc" as const }, { id: "asc" as const }],
    select: {
      id: true, dayIndex: true, localDate: true,
      _count: { select: { visits: true } },
      visits: {
        orderBy: [{ order: "asc" as const }, { id: "asc" as const }],
        select: {
          id: true, order: true, startMinute: true, plannedDurationMinutes: true,
          externalPlace: { select: { providerPlaceId: true, name: true, latitude: true, longitude: true, fetchedAt: true } },
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
  userId: string;
  startDate: Date;
  manuallyCompletedAt: Date | null;
  durationDays: number;
  transport: "CAR" | "MOTORCYCLE";
  favorites: { id: string }[];
  days: { _count: { visits: number } }[];
  user?: { name: string | null } | null;
  companionPublication?: { id: string; title: string } | null;
};

function summary(row: SummaryRow, referenceDate: string, actorId: string): TripSummary {
  const startDate = row.startDate.toISOString().slice(0, 10);
  const isHost = row.userId === actorId;
  return {
    id: row.id,
    startDate,
    durationDays: row.durationDays,
    transport: row.transport,
    manuallyCompletedAt: row.manuallyCompletedAt?.toISOString() ?? null,
    isFavorite: row.favorites.length > 0,
    visitCount: row.days.reduce((total, day) => total + day._count.visits, 0),
    role: isHost ? "HOST" : "MEMBER",
    publicationId: row.companionPublication?.id ?? null,
    companionTitle: row.companionPublication?.title ?? null,
    hostName: isHost ? null : (row.user?.name ?? null),
    ...effectiveTripStatus(startDate, row.durationDays, referenceDate, row.manuallyCompletedAt),
  };
}

export async function listMyTrips(headers: Headers, deps: TripReadDependencies, referenceDate: string): Promise<{ items: TripSummary[] }> {
  const actor = await requireTraveler(headers, deps);
  const rows = await deps.database.trip.findMany({
    where: {
      OR: [
        { userId: actor.userId },
        {
          companionPublication: {
            memberships: {
              some: {
                userId: actor.userId,
                state: "ACTIVE",
              },
            },
          },
        },
      ],
    },
    orderBy: [{ startDate: "asc" }, { id: "asc" }],
    select: summarySelect(actor.userId),
  });
  return { items: rows.map(row => summary(row, referenceDate, actor.userId)) };
}

export async function getMyTrip(headers: Headers, id: string, deps: TripReadDependencies, referenceDate: string, now: Date = new Date()): Promise<TripDetail> {
  const actor = await requireTraveler(headers, deps);
  const found = await deps.database.trip.findFirst({
    where: {
      id,
      OR: [
        { userId: actor.userId },
        {
          companionPublication: {
            memberships: {
              some: {
                userId: actor.userId,
                state: "ACTIVE",
              },
            },
          },
        },
      ],
    },
    select: detailSelect(actor.userId),
  });
  if (!found) throw new AppError("TRIP_NOT_FOUND", "Không tìm thấy chuyến đi.", 404);
  const row = found;
  const isOwner = row.userId === actor.userId;
  /** KLTN destination or saved external place; exactly one is set (DB CHECK). */
  const placeOf = (visit: (typeof row.days)[number]["visits"][number]): TripDetail["days"][number]["visits"][number]["destination"] => {
    if (visit.destination) {
      return {
        id: visit.destination.id, name: visit.destination.name, area: visit.destination.area,
        category: (visit.destination as { category?: string }).category,
        latitude: (visit.destination as { latitude?: number }).latitude,
        longitude: (visit.destination as { longitude?: number }).longitude,
        address: (visit.destination as { address?: string | null }).address ?? null,
        description: (visit.destination as { description?: string }).description,
        visibility: visit.destination.visibility,
        availability: visit.destination.visibility === "VISIBLE" && !visit.destination.deletedAt ? "AVAILABLE" : "UNAVAILABLE",
      };
    }
    if (visit.externalPlace) return externalPlaceView(visit.externalPlace, now, isOwner);
    throw new AppError("TRIP_PLACE_UNAVAILABLE", "Chưa thể đọc địa điểm của chuyến đi.", 503);
  };
  let journey: SavedJourney | null = null;
  if (row.userId === actor.userId && row.journeySnapshot != null) {
    const parsed = savedJourneySchema.safeParse(row.journeySnapshot);
    if (!parsed.success) throw new AppError("TRIP_JOURNEY_DATA_UNAVAILABLE", "Chưa thể đọc thông tin đi/về của chuyến đi.", 503);
    journey = parsed.data;
    const currentFingerprint = journeyVisitFingerprint(row.days.map(day => ({ dayIndex: day.dayIndex, visits: day.visits.map(visit => ({ ...visit, destinationId: placeOf(visit).id })) })));
    if (journey.visitFingerprint !== currentFingerprint) journey = { ...journey, plan: null };
  }
  const storedUnchecked = row.uncheckedChecks == null ? null : storedUncheckedSchema.safeParse(row.uncheckedChecks).data ?? null;
  return {
    ...summary(row, referenceDate, actor.userId),
    ...(row.userId === actor.userId ? { journey, baseRevision: row.updatedAt?.toISOString() } : {}),
    ...(isOwner && storedUnchecked ? { unchecked: { items: storedUnchecked.items, confirmedAt: row.uncheckedConfirmedAt?.toISOString() ?? null } } : {}),
    days: [...row.days].sort((a, b) => a.dayIndex - b.dayIndex || a.id.localeCompare(b.id)).map(day => ({
      id: day.id, dayIndex: day.dayIndex, localDate: day.localDate.toISOString().slice(0, 10),
      visits: [...day.visits].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)).map(visit => ({
        id: visit.id, order: visit.order, startMinute: visit.startMinute,
        plannedDurationMinutes: visit.plannedDurationMinutes,
        destination: placeOf(visit),
      })),
    })),
  };
}
