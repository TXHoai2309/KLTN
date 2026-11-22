import type { Database, Prisma } from "@KLTN/db";

import { requireTraveler } from "@/server/auth/require-traveler";
import type { AuthorizationDependencies } from "@/server/authorization/guard";
import { AppError } from "@/server/http/app-error";
import { effectiveTripStatus, type TripStatus } from "./trip-status";
import type { TravelLeg } from "../trip-planner/planner-contract";
import { destinationMediaWhere, isDestinationMediaUsable } from "../destination/destination-media-eligibility";
import { savedJourneySchema, journeyVisitFingerprint, type SavedJourney } from "../trip-origin/journey-saved-contract";
import { externalPlaceView } from "./external-place-cache";
import { storedUncheckedSchema, type UncheckedItem } from "../trip-save/unchecked-checks";
import { readPinnedItems, type PinnedItem } from "../trip-save/trip-pin-contract";

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
  firstStopImage?: { url: string; alt: string } | null;
  firstArea?: string | null;
  lastArea?: string | null;
  homeCity?: string | null;
  originLabel?: string | null;
};

export type TripChosenLodgingDetail = {
  id: string;
  nightIndex: number;
  placeId: string;
  name: string;
  latitude?: number;
  longitude?: number;
};

/** ADR-45: unchecked Google Maps places shown near a stop (`visit-K`) or a night (`overnight`); never a visit. */
export type TripNearbySuggestionDetail = { dayIndex: number; slot: string; kind: "ACTIVITY" | "EVENING"; placeId: string; name: string; distanceKm: number };

export type TripDetail = TripSummary & {
  /** Only HOST receives this property; legacy owner reads explicitly return null. */
  journey?: SavedJourney | null;
  /** Owner only: checks the Trip was saved with as UNCHECKED (never PASS). Absent when nothing was unchecked. */
  unchecked?: { items: UncheckedItem[]; confirmedAt: string | null };
  /** Ticket 11: chosen lodgings saved per night (separate from ItineraryVisit; never a booking). */
  chosenLodgings?: TripChosenLodgingDetail[];
  nearbySuggestions?: TripNearbySuggestionDetail[];
  /** ADR-47: items pinned from the planning chat (owner read). */
  pinnedItems?: PinnedItem[];
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
        image?: { url: string; alt: string };
        /** A place outside the KLTN catalogue: no destination page; name/coordinates are a 30-day cache. */
        external?: true;
      };
      inbound?: TravelLeg | null;
    }[];
  }[];
};

const summarySelect = (userId: string) => ({
  id: true, userId: true, startDate: true, durationDays: true, transport: true, manuallyCompletedAt: true,
  journeySnapshot: true,
  user: { select: { name: true } },
  favorites: { where: { userId }, select: { id: true } },
  pinnedItems: { orderBy: { sortOrder: "asc" as const }, select: { payload: true } },
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
  chosenLodgings: {
    orderBy: [{ nightIndex: "asc" as const }, { id: "asc" as const }],
    select: {
      id: true,
      nightIndex: true,
      externalPlace: { select: { providerPlaceId: true, name: true, latitude: true, longitude: true, fetchedAt: true } },
    },
  },
  nearbySuggestions: {
    orderBy: [{ dayIndex: "asc" as const }, { sortOrder: "asc" as const }],
    select: { dayIndex: true, slot: true, kind: true, placeId: true, name: true, distanceKm: true },
  },
  pinnedItems: { orderBy: { sortOrder: "asc" as const }, select: { payload: true } },
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
              media: { where: destinationMediaWhere, take: 20, orderBy: [{ isCover: "desc" as const }, { position: "asc" as const }, { id: "asc" as const }], select: { url: true, alt: true, websiteRights: true, storageReference: true } },
              visibility: true,
              deletedAt: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.TripSelect);

type SummaryVisitMedia = { url: string; alt: string; websiteRights: string; storageReference?: string | null };
type SummaryRow = {
  id: string;
  userId: string;
  startDate: Date;
  manuallyCompletedAt: Date | null;
  durationDays: number;
  transport: "CAR" | "MOTORCYCLE";
  journeySnapshot?: unknown;
  favorites: { id: string }[];
  pinnedItems?: { payload: unknown }[];
  days: {
    dayIndex?: number;
    _count: { visits: number };
    visits?: {
      destination?: {
        id: string;
        name: string;
        area: string;
        media?: SummaryVisitMedia[];
      } | null;
    }[];
  }[];
  user?: { name: string | null } | null;
  companionPublication?: { id: string; title: string } | null;
};

function summary(row: SummaryRow, referenceDate: string, actorId: string): TripSummary {
  const startDate = row.startDate.toISOString().slice(0, 10);
  const isHost = row.userId === actorId;
  const allVisits = row.days.flatMap((day) => day.visits ?? []);
  const firstDest = allVisits.find((visit) => visit.destination)?.destination ?? null;
  const lastDest = [...allVisits].reverse().find((visit) => visit.destination)?.destination ?? null;
  const firstMedia = firstDest?.media?.find((media) => isDestinationMediaUsable(media, firstDest.id));
  const pins = isHost && row.pinnedItems ? readPinnedItems(row.pinnedItems) : [];
  const accessHomeCity = pins.filter((item): item is Extract<PinnedItem, { kind: "ACCESS" }> => item.kind === "ACCESS").at(-1)?.leg.homeCity ?? null;
  const parsedJourney = isHost && row.journeySnapshot != null ? savedJourneySchema.safeParse(row.journeySnapshot) : null;
  const originLabel = parsedJourney?.success ? (parsedJourney.data.journey.origin?.label ?? null) : null;
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
    ...(firstMedia ? { firstStopImage: { url: firstMedia.url, alt: firstMedia.alt } } : {}),
    ...(firstDest?.area ? { firstArea: firstDest.area } : {}),
    ...(lastDest?.area ? { lastArea: lastDest.area } : {}),
    ...(accessHomeCity ? { homeCity: accessHomeCity } : {}),
    ...(originLabel ? { originLabel } : {}),
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
  const tripIds = rows.map((row) => row.id);
  const previewByTrip = new Map<string, { firstStopImage?: { url: string; alt: string }; firstArea?: string; lastArea?: string }>();
  if (tripIds.length > 0 && typeof (deps.database as { itineraryVisit?: { findMany?: unknown } }).itineraryVisit?.findMany === "function") {
    const visitRows = await deps.database.itineraryVisit.findMany({
      where: { day: { tripId: { in: tripIds } }, destinationId: { not: null } },
      orderBy: [{ day: { dayIndex: "asc" } }, { order: "asc" }, { id: "asc" }],
      select: {
        day: { select: { tripId: true } },
        destination: {
          select: {
            id: true,
            area: true,
            media: {
              where: destinationMediaWhere,
              take: 4,
              orderBy: [{ isCover: "desc" }, { position: "asc" }, { id: "asc" }],
              select: { url: true, alt: true, websiteRights: true, storageReference: true },
            },
          },
        },
      },
    });
    for (const visit of visitRows) {
      const dest = visit.destination;
      if (!dest) continue;
      const tid = visit.day.tripId;
      const existing = previewByTrip.get(tid) ?? {};
      if (!existing.firstArea && dest.area) existing.firstArea = dest.area;
      if (!existing.firstStopImage) {
        const media = dest.media.find((m) => isDestinationMediaUsable(m, dest.id));
        if (media) existing.firstStopImage = { url: media.url, alt: media.alt };
      }
      if (dest.area) existing.lastArea = dest.area;
      previewByTrip.set(tid, existing);
    }
  }
  return {
    items: rows.map((row) => {
      const preview = previewByTrip.get(row.id);
      return {
        ...summary(row, referenceDate, actor.userId),
        ...(preview?.firstStopImage ? { firstStopImage: preview.firstStopImage } : {}),
        ...(preview?.firstArea ? { firstArea: preview.firstArea } : {}),
        ...(preview?.lastArea ? { lastArea: preview.lastArea } : {}),
      };
    }),
  };
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
      const dest = visit.destination;
      const image = (dest as { media?: { url: string; alt: string; websiteRights: string; storageReference?: string | null }[] }).media?.find(media => isDestinationMediaUsable(media, dest.id));
      return {
        id: dest.id, name: dest.name, area: dest.area,
        category: (dest as { category?: string }).category,
        latitude: (dest as { latitude?: number }).latitude,
        longitude: (dest as { longitude?: number }).longitude,
        address: (dest as { address?: string | null }).address ?? null,
        description: (dest as { description?: string }).description,
        visibility: dest.visibility,
        availability: dest.visibility === "VISIBLE" && !dest.deletedAt ? "AVAILABLE" : "UNAVAILABLE",
        ...(image ? { image: { url: image.url, alt: image.alt } } : {}),
      };
    }
    if (visit.externalPlace) return externalPlaceView(visit.externalPlace, now, isOwner);
    throw new AppError("TRIP_PLACE_UNAVAILABLE", "Chưa thể đọc địa điểm của chuyến đi.", 503);
  };
  let journey: SavedJourney | null = null;
  const inbound = new Map<string, TravelLeg>();
  if (row.journeySnapshot != null) {
    const parsed = savedJourneySchema.safeParse(row.journeySnapshot);
    if (!parsed.success && isOwner) throw new AppError("TRIP_JOURNEY_DATA_UNAVAILABLE", "Chưa thể đọc thông tin đi/về của chuyến đi.", 503);
    if (parsed.success) {
      const snapshot = parsed.data;
      const currentFingerprint = journeyVisitFingerprint(row.days.map(day => ({ dayIndex: day.dayIndex, visits: day.visits.map(visit => ({ ...visit, destinationId: placeOf(visit).id })) })));
      const plan = snapshot.visitFingerprint === currentFingerprint ? snapshot.plan : null;
      if (isOwner) journey = { ...snapshot, plan };
      // Only attraction-to-attraction evidence is projected to members; never origin endpoints/geometry.
      for (const leg of plan?.legs ?? []) {
        if (leg.kind !== "TRANSFER" || leg.from.kind !== "ATTRACTION" || leg.to.kind !== "ATTRACTION") continue;
        inbound.set(leg.to.destinationId, { ...leg.route, fromDestinationId: leg.from.destinationId, toDestinationId: leg.to.destinationId });
      }
    }
  }
  const storedUnchecked = row.uncheckedChecks == null ? null : storedUncheckedSchema.safeParse(row.uncheckedChecks).data ?? null;
  const chosenLodgings: TripChosenLodgingDetail[] = ((row as { chosenLodgings?: { id: string; nightIndex: number; externalPlace: { providerPlaceId: string; name: string | null; latitude: number | null; longitude: number | null; fetchedAt: Date } }[] }).chosenLodgings ?? [])
    .slice()
    .sort((a, b) => a.nightIndex - b.nightIndex || a.id.localeCompare(b.id))
    .map(item => {
      const view = externalPlaceView(item.externalPlace, now, isOwner);
      return {
        id: item.id,
        nightIndex: item.nightIndex,
        placeId: item.externalPlace.providerPlaceId,
        name: view.name,
        ...(view.latitude !== undefined && view.longitude !== undefined ? { latitude: view.latitude, longitude: view.longitude } : {}),
      };
    });
  const pinnedItems = readPinnedItems((row as { pinnedItems?: { payload: unknown }[] }).pinnedItems ?? []);
  const nearbySuggestions = ((row as { nearbySuggestions?: TripNearbySuggestionDetail[] }).nearbySuggestions ?? []).filter(item => item.kind === "ACTIVITY" || item.kind === "EVENING");
  return {
    ...summary(row, referenceDate, actor.userId),
    ...(row.userId === actor.userId ? { journey, baseRevision: row.updatedAt?.toISOString() } : {}),
    ...(isOwner && storedUnchecked ? { unchecked: { items: storedUnchecked.items, confirmedAt: row.uncheckedConfirmedAt?.toISOString() ?? null } } : {}),
    ...(chosenLodgings.length ? { chosenLodgings } : {}),
    ...(nearbySuggestions.length ? { nearbySuggestions } : {}),
    ...(isOwner && pinnedItems.length ? { pinnedItems } : {}),
    days: [...row.days].sort((a, b) => a.dayIndex - b.dayIndex || a.id.localeCompare(b.id)).map(day => ({
      id: day.id, dayIndex: day.dayIndex, localDate: day.localDate.toISOString().slice(0, 10),
      visits: [...day.visits].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)).map(visit => ({
        id: visit.id, order: visit.order, startMinute: visit.startMinute,
        plannedDurationMinutes: visit.plannedDurationMinutes,
        destination: placeOf(visit),
        ...(inbound.has(placeOf(visit).id) ? { inbound: inbound.get(placeOf(visit).id)! } : {}),
      })),
    })),
  };
}
