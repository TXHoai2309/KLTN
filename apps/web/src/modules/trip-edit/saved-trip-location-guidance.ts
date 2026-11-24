import type { Database } from "@KLTN/db";
import { cleanPlaceDisplayName } from "../../lib/traveler-display-clean";
import type { InTripLocation } from "../in-trip/in-trip-location";
import type { StructuredLlmClient } from "../preference-extraction/preference-extraction-client";
import { haversine } from "../trip-planner/planner-geography";
import { vietnamCoverageAt } from "../trip-origin/vietnam-coverage";
import type { TripStatus } from "../trip-read/trip-status";
import { vietnamDateOf } from "../trip-requirement/trip-requirement-readiness";
import { tripDayDate } from "../trip-validation/trip-proposal-contract";
import type { ForecastOptions } from "../trip-weather/forecast";
import { computeSunTimes, formatMinute } from "../trip-weather/sun-times";
import { isLodgingPlace } from "../tripsage-chat/tripsage-activities";
import type { ExternalPlaceSuggestion, PlacesSearch } from "../tripsage-chat/tripsage-places";
import type { AdviceTopic } from "./ai-workspace-plan";
import {
  addVisit,
  MAX_EDIT_VISITS,
  removeVisit,
  setVisitTime,
  type EditCandidate,
  type SavedTripForEdit,
} from "./edit-candidate";
import { minuteClockLabel } from "./edit-journey-helper";
import { autoShiftDayVisits } from "./edit-workspace-checks";
import {
  buildVerifiedAdvisoryFacts,
  composeGroundedAdviceWithFallback,
  dryRunAdvisoryRemedies,
  gatherWeatherAndSunDigest,
  type AdviceSuggestionCard,
  type AdvisoryCatalogDestination,
  type RemedyBlueprint,
  type RunPreviewFn,
} from "./saved-trip-advisory";
import type {
  EditPlaceDetail,
  PreviewEditResult,
  TripEditRouteProvider,
} from "./trip-edit-service";

export type ParsedLocationRequest = {
  needsCurrentLocation: boolean;
  intentMode: "NEARBY_OPTIONS" | "NEARBY_SERVICES" | "NEXT_VISIT_ETA" | "TRAFFIC_RECOVER";
};

export type OngoingLocationOutcome =
  | { kind: "NOT_APPLICABLE" }
  | { kind: "NEEDS_LOCATION"; prompt: string; pendingMessage: string }
  | { kind: "ADVISED"; advice: string; suggestions: AdviceSuggestionCard[] };

function foldVi(raw: string): string {
  return raw
    .normalize("NFC")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/giu, "d")
    .toLowerCase()
    .trim();
}

function vietnamClockMinute(now: Date): number {
  const formatted = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(now);
  const match = /^(\d{2}):(\d{2})/u.exec(formatted);
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(s));
}

function toAddedPlaceDetail(dest: AdvisoryCatalogDestination): EditPlaceDetail {
  return {
    id: dest.id,
    name: dest.name,
    area: dest.area ?? "",
    ...(typeof dest.category === "string" ? { category: dest.category } : {}),
    ...(typeof dest.latitude === "number" ? { latitude: dest.latitude } : {}),
    ...(typeof dest.longitude === "number" ? { longitude: dest.longitude } : {}),
    suggestedDurationMinutes: dest.suggestedDurationMinutes ?? null,
    minimumDurationMinutes: dest.minimumDurationMinutes ?? null,
    ...(typeof dest.isOutdoor === "boolean" ? { isOutdoor: dest.isOutdoor } : {}),
    availability: "AVAILABLE",
    external: false,
  };
}

function formatDurationVi(minutes: number): string {
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem === 0 ? `${hours} giờ` : `${hours} giờ ${rem} phút`;
}

function formatDistanceVi(distanceMeters: number): string {
  if (distanceMeters < 1000) return `${Math.max(1, Math.round(distanceMeters))} m`;
  const km = Math.round((distanceMeters / 1000) * 10) / 10;
  return `${km} km`;
}

function calendarDayDiff(fromYmd: string | null | undefined, toYmd: string | null | undefined): number | null {
  if (!fromYmd || !toYmd) return null;
  const fromMs = Date.parse(`${fromYmd}T00:00:00Z`);
  const toMs = Date.parse(`${toYmd}T00:00:00Z`);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return null;
  return Math.round((toMs - fromMs) / 86_400_000);
}

function periodOfDayVi(minute: number): string {
  if (minute < 720) return "sáng";
  if (minute < 840) return "trưa";
  if (minute < 1080) return "chiều";
  return "tối";
}

function formatScheduledNextTimeVi(
  localDate: string | null,
  todayVn: string,
  dayIndex: number,
  startMinute: number,
): string {
  const clock = minuteClockLabel(startMinute);
  const diff = calendarDayDiff(todayVn, localDate);
  const period = periodOfDayVi(startMinute);
  if (diff === 0) return `hôm nay ${clock} (Ngày ${dayIndex})`;
  if (diff === 1) return `${period} mai ${clock} (Ngày ${dayIndex})`;
  if (localDate) return `Ngày ${dayIndex} (${localDate.split("-").reverse().join("/")}) lúc ${clock}`;
  return `Ngày ${dayIndex} lúc ${clock}`;
}

type ChronologicalVisit = {
  dayIndex: number;
  localDate: string | null;
  visit: EditCandidate["days"][number]["visits"][number];
};

function findChronologicalNextVisit(input: {
  baseCandidate: EditCandidate;
  lockedVisitIds: ReadonlySet<string>;
  todayVn: string;
  nowMin: number;
}): { upcoming: ChronologicalVisit | null; inProgress: ChronologicalVisit | null } {
  const sortedDays = [...input.baseCandidate.days].sort((a, b) => a.dayIndex - b.dayIndex);
  let upcoming: ChronologicalVisit | null = null;
  let inProgress: ChronologicalVisit | null = null;

  for (const day of sortedDays) {
    const localDate = tripDayDate(input.baseCandidate.startDate, day.dayIndex);
    const sortedVisits = [...day.visits].sort(
      (a, b) => a.startMinute - b.startMinute || a.order - b.order,
    );
    for (const visit of sortedVisits) {
      if (input.lockedVisitIds.has(visit.visitId)) continue;
      const entry: ChronologicalVisit = { dayIndex: day.dayIndex, localDate, visit };
      if (!localDate) {
        if (!upcoming) upcoming = entry;
        continue;
      }
      if (localDate > input.todayVn || (localDate === input.todayVn && visit.startMinute > input.nowMin)) {
        if (!upcoming) upcoming = entry;
      } else if (
        localDate === input.todayVn &&
        visit.startMinute <= input.nowMin &&
        visit.startMinute + visit.plannedDurationMinutes > input.nowMin &&
        !inProgress
      ) {
        inProgress = entry;
      }
    }
  }

  return { upcoming, inProgress };
}

type NearbyServiceCategory = {
  query: string;
  label: string;
  allowLodging: boolean;
};

const SERVICE_CATEGORY_RULES: readonly {
  pattern: RegExp;
  query: string;
  label: string;
  allowLodging?: boolean;
}[] = [
  {
    pattern: /\b(?:cay\s+xang|tram\s+xang|do\s+xang)\b/u,
    query: "cây xăng",
    label: "cây xăng",
  },
  {
    pattern: /\b(?:sua\s+xe|tiem\s+sua\s+xe|va\s+xe|va\s+lop|gara|cuu\s+ho\s+xe)\b/u,
    query: "sửa xe",
    label: "tiệm sửa xe",
  },
  {
    pattern: /\b(?:atm|rut\s+tien|ngan\s+hang)\b/u,
    query: "ATM ngân hàng",
    label: "cây ATM / ngân hàng",
  },
  {
    pattern: /\b(?:nha\s+thuoc|hieu\s+thuoc|quay\s+thuoc|tiem\s+thuoc)\b/u,
    query: "nhà thuốc",
    label: "nhà thuốc",
  },
  {
    pattern: /\b(?:co\s+so\s+y\s+te|benh\s+vien|phong\s+kham|tram\s+y\s+te|trung\s+tam\s+y\s+te|cap\s+cuu|y\s+te)\b/u,
    query: "bệnh viện phòng khám cơ sở y tế",
    label: "cơ sở y tế",
  },
  {
    pattern: /\b(?:cho\s+nghi|nha\s+nghi|khach\s+san|homestay|hotel|hostel|resort|cho\s+ngu|thue\s+phong)\b/u,
    query: "khách sạn nhà nghỉ homestay",
    label: "chỗ nghỉ",
    allowLodging: true,
  },
  {
    pattern: /\b(?:ca\s+phe|cafe|coffee|tra\s+sua|quan\s+nuoc|tra\s+chanh)\b/u,
    query: "quán cà phê",
    label: "quán cà phê",
  },
  {
    pattern: /\b(?:quan\s+an|nha\s+hang|an\s+uong|an\s+dem|an\s+khuya|an\s+toi|an\s+trua|an\s+sang|tiem\s+an|do\s+an|quan\s+(?:pho|bun|com|lau))\b/u,
    query: "quán ăn",
    label: "quán ăn",
  },
];

function classifyNearbyServiceQuery(folded: string): NearbyServiceCategory | null {
  const isScheduleMutation = /\b(?:them|chen|bo\s+sung|dua)\b.{0,30}\b(?:vao\s+lich|vao\s+hanh\s+trinh|vao\s+ngay)\b/u.test(
    folded,
  );
  if (isScheduleMutation) return null;

  for (const rule of SERVICE_CATEGORY_RULES) {
    if (rule.pattern.test(folded)) {
      return {
        query: rule.query,
        label: rule.label,
        allowLodging: Boolean(rule.allowLodging),
      };
    }
  }
  return null;
}

const NEARBY_SERVICE_RADII_KM = [3, 5, 10] as const;
const MAX_NEARBY_SERVICES = 5;

async function searchNearbyServicesFromPlaces(input: {
  places: PlacesSearch | undefined;
  category: NearbyServiceCategory;
  location: InTripLocation;
  signal?: AbortSignal;
}): Promise<
  | { status: "RESULTS"; places: { place: ExternalPlaceSuggestion; distKm: number }[]; radiusKm: number }
  | { status: "NO_RESULTS" }
  | { status: "UNAVAILABLE" }
> {
  if (!input.places) return { status: "UNAVAILABLE" };

  for (const radiusKm of NEARBY_SERVICE_RADII_KM) {
    let outcome;
    try {
      outcome = await input.places(
        input.category.query,
        input.signal,
        {
          latitude: input.location.latitude,
          longitude: input.location.longitude,
          radiusKm,
        },
      );
    } catch {
      return { status: "UNAVAILABLE" };
    }
    if (outcome.status === "UNAVAILABLE") {
      return { status: "UNAVAILABLE" };
    }
    if (outcome.status === "NO_RESULTS") {
      continue;
    }

    const filtered = outcome.places
      .filter((place) => input.category.allowLodging || !isLodgingPlace(place))
      .map((place) => ({
        place,
        distKm: haversine(
          { latitude: input.location.latitude, longitude: input.location.longitude },
          { latitude: place.latitude, longitude: place.longitude },
        ),
      }))
      .sort((a, b) => a.distKm - b.distKm)
      .slice(0, MAX_NEARBY_SERVICES);

    if (filtered.length > 0) {
      return { status: "RESULTS", places: filtered, radiusKm };
    }
  }

  return { status: "NO_RESULTS" };
}

export function parseLocationDependentRequest(input: {
  message: string;
  mode: string;
  topic: AdviceTopic;
}): ParsedLocationRequest {
  const folded = foldVi(input.message);
  const serviceCategory = classifyNearbyServiceQuery(folded);

  const hasNextVisitTarget = /\b(?:diem|luot|cho|chang)\s+(?:tiep\s+theo|ke\s+tiep)\b/u.test(folded);
  const hasEtaOrDistanceAsk =
    /(?:\b(?:mat|het)\s+bao\s+lau\b|\bbao\s+lau\b|\bbao\s+xa\b|\bcach\s+bao\s+xa\b|\bmay\s+phut\b|\bmay\s+(?:km|cay\s+so)\b|\bbao\s+nhieu\s+(?:km|phut|gio)\b|\b(?:may\s+gio|luc\s+nao|khi\s+nao)\s+(?:nen|can|phai)?\s*(?:xuat\s+phat|di|khoi\s+hanh)\b|\bxuat\s+phat\s+(?:luc\s+nao|may\s+gio|truoc\s+may\s+gio)\b|\bdi\s+truoc\s+may\s+gio\b|\bco\s+kip\b)/u.test(
      folded,
    );
  const hasEditOrRecoveryCue =
    /\b(?:ket\s+xe|tac\s+duong|doi\s+lich|sua\s+lich|chinh\s+lich|bo\s+bot|xoa\b|them\b|chen\b|doi\s+sang|day\s+gio|lui\s+gio|rut\s+ngan|xep\s+lai|sap\s+xep\s+lai|chieu\s+nay\s+di\s+tiep\s+nhung\s+diem\s+nao|di\s+nhung\s+diem\s+nao\s+kip)\b/u.test(
      folded,
    );
  const isNextVisitEtaQuery = hasNextVisitTarget && hasEtaOrDistanceAsk && !hasEditOrRecoveryCue;

  const isServiceAsk = Boolean(
    serviceCategory &&
      /\b(?:quanh\s+(?:day|minh|cho)|gan\s+(?:day|minh|cho)|o\s+day|quanh\s+vi\s+tri|gan\s+vi\s+tri)\b/u.test(
        folded,
      ),
  );

  if (
    !isNextVisitEtaQuery &&
    !isServiceAsk &&
    (input.mode === "APPLY_BATCH" || input.mode === "CHANGE_ORIGIN_CLOCKS")
  ) {
    return { needsCurrentLocation: false, intentMode: "TRAFFIC_RECOVER" };
  }

  const explicitLocationPattern =
    /(?:\bcho\s+(?:toi|minh|em|anh|chi)\s+(?:dang\s+)?dung\b|\bvi\s+tri\s+hien\s+tai\b|\bvi\s+tri\s+cua\s+(?:toi|minh|em)\b|\bvi\s+tri\s+(?:vua|moi)\s+chia\s+se\b|\bquanh\s+(?:cho\s+(?:toi|minh|em)|day|minh)\b|\bgan\s+cho\s+(?:toi|minh|em)\b|\bgan\s+(?:day|minh)\s+(?:co|nao)\b|\bdang\s+(?:bi\s+)?(?:ket\s+xe|tac\s+duong)\s+(?:o|tai)\s+day\b|\bket\s+xe\s+o\s+day\b|\b(?:tu|cach)\s+(?:cho\s+(?:toi|minh|em)|vi\s+tri\s+(?:nay|hien\s+tai)|day)\s+(?:den|di|toi|la)?\b|\bo\s+day\s+thi\s+(?:chieu|bay\s+gio|hom\s+nay)\b)/u;

  const implicitNextVisitLocationAsk =
    isNextVisitEtaQuery &&
    /(?:\b(?:tu|cho|vi\s+tri|day)\b|\b(?:di\s+)?(?:toi|den)\s+(?:diem|luot)\s+(?:tiep\s+theo|ke\s+tiep)\b)/u.test(
      folded,
    );

  const needsCurrentLocation =
    input.topic === "LOCATION_GUIDANCE" ||
    explicitLocationPattern.test(folded) ||
    implicitNextVisitLocationAsk;

  const isNearbyOptions = /\b(?:gan\s+cho|quanh\s+cho|gan\s+day|quanh\s+day|gan\s+minh|quanh\s+minh|ghe\s+duoc\s+khong|diem\s+nao\s+gan|diem\s+tham\s+quan)\b/u.test(
    folded,
  );

  const intentMode: ParsedLocationRequest["intentMode"] = isServiceAsk
    ? "NEARBY_SERVICES"
    : isNearbyOptions
      ? "NEARBY_OPTIONS"
      : isNextVisitEtaQuery
        ? "NEXT_VISIT_ETA"
        : "TRAFFIC_RECOVER";

  return { needsCurrentLocation, intentMode };
}

export async function runOngoingLocationScenario(input: {
  message: string;
  mode: string;
  tripStatus: TripStatus;
  location?: InTripLocation;
  baseCandidate: EditCandidate;
  savedShape: SavedTripForEdit & { manuallyCompletedAt?: Date | null };
  placeNames: ReadonlyMap<string, string>;
  placeDetailsById: ReadonlyMap<string, { isOutdoor?: boolean; availability?: string; external?: boolean }>;
  externalPlaceCoords?: ReadonlyMap<string, { latitude: number; longitude: number }>;
  eligibleDestinations: readonly AdvisoryCatalogDestination[];
  allCatalogDestinations: readonly AdvisoryCatalogDestination[];
  lockedVisitIds: ReadonlySet<string>;
  baselinePreview: PreviewEditResult;
  runPreview: RunPreviewFn;
  getRoute: TripEditRouteProvider;
  places?: PlacesSearch;
  signal?: AbortSignal;
  createVisitId: () => string;
  database: Pick<Database, "destination">;
  llm: StructuredLlmClient;
  forecast?: ForecastOptions;
  focusDayIndex: number | null;
  topic: AdviceTopic;
  timeReference: Date;
}): Promise<OngoingLocationOutcome> {
  const parsed = parseLocationDependentRequest({
    message: input.message,
    mode: input.mode,
    topic: input.topic,
  });
  if (!parsed.needsCurrentLocation) {
    return { kind: "NOT_APPLICABLE" };
  }

  // UPCOMING trips NEVER force GPS / NEEDS_LOCATION
  if (input.tripStatus !== "ONGOING") {
    return {
      kind: "ADVISED",
      advice:
        "Chuyến đi hiện đang ở trạng thái sắp tới nên không cần chia sẻ vị trí GPS hiện tại. Bạn có thể bổ sung Nơi xuất phát trên Timeline hoặc hỏi gợi ý điểm đến theo từng khu vực/ngày trong lịch.",
      suggestions: [],
    };
  }

  if (!input.location) {
    return {
      kind: "NEEDS_LOCATION",
      prompt:
        "Yêu cầu này cần biết vị trí bạn đang đứng để tính chính xác quãng đường và thời gian tới các điểm còn lại. Bạn hãy chia sẻ GPS một lần hoặc chọn vị trí thủ công trên bản đồ.",
      pendingMessage: input.message,
    };
  }

  const coverage = vietnamCoverageAt({
    latitude: input.location.latitude,
    longitude: input.location.longitude,
  });
  if (coverage !== "SUPPORTED") {
    return {
      kind: "NEEDS_LOCATION",
      prompt:
        "Vị trí vừa chọn nằm ngoài phạm vi hỗ trợ tại Việt Nam. Bạn hãy chọn lại vị trí thuộc Việt Nam trên bản đồ hoặc thử lại GPS.",
      pendingMessage: input.message,
    };
  }

  const catalogById = new Map(input.allCatalogDestinations.map((d) => [d.id, d]));
  const todayVn = vietnamDateOf(input.timeReference);
  const nowMin = vietnamClockMinute(input.timeReference);

  if (parsed.intentMode === "NEXT_VISIT_ETA") {
    const { upcoming, inProgress } = findChronologicalNextVisit({
      baseCandidate: input.baseCandidate,
      lockedVisitIds: input.lockedVisitIds,
      todayVn,
      nowMin,
    });
    const targetEntry = upcoming ?? inProgress;
    if (!targetEntry) {
      return {
        kind: "ADVISED",
        advice:
          "Theo vị trí bạn vừa chia sẻ, hành trình hiện không còn lượt tham quan nào sắp tới; các lượt trong lịch đều đã qua giờ.",
        suggestions: [],
      };
    }

    const targetVisit = targetEntry.visit;
    const targetName = input.placeNames.get(targetVisit.destinationId) ?? "điểm tiếp theo";
    const targetDest = catalogById.get(targetVisit.destinationId);
    const targetExt = input.externalPlaceCoords?.get(targetVisit.destinationId);
    const targetLat =
      targetDest && typeof targetDest.latitude === "number"
        ? targetDest.latitude
        : targetExt?.latitude;
    const targetLon =
      targetDest && typeof targetDest.longitude === "number"
        ? targetDest.longitude
        : targetExt?.longitude;

    const whenLabel = formatScheduledNextTimeVi(
      targetEntry.localDate,
      todayVn,
      targetEntry.dayIndex,
      targetVisit.startMinute,
    );
    const vehicleLabel = input.baseCandidate.transport === "CAR" ? "ô tô" : "xe máy";
    const isInProgressOnly = !upcoming && Boolean(inProgress);

    if (typeof targetLat !== "number" || typeof targetLon !== "number") {
      return {
        kind: "ADVISED",
        advice: `Điểm tiếp theo là ${targetName}, ${whenLabel}. Hiện điểm này chưa có đủ tọa độ để định tuyến theo vị trí bạn vừa chia sẻ bằng ${vehicleLabel}, nên chưa tính được quãng đường, thời gian di chuyển hay giờ xuất phát.`,
        suggestions: [],
      };
    }

    const route = await input.getRoute({
      origin: {
        latitude: input.location.latitude,
        longitude: input.location.longitude,
      },
      destination: {
        latitude: targetLat,
        longitude: targetLon,
      },
      vehicle: input.baseCandidate.transport,
    });

    if (route.kind !== "ok" || typeof route.durationSeconds !== "number") {
      return {
        kind: "ADVISED",
        advice: `Điểm tiếp theo là ${targetName}, ${whenLabel}. Hiện hệ thống chưa định tuyến được lộ trình bằng ${vehicleLabel} theo vị trí bạn vừa chia sẻ tới điểm này nên chưa có số đo quãng đường, thời gian di chuyển và giờ xuất phát chính xác.`,
        suggestions: [],
      };
    }

    const driveMinutes = Math.max(1, Math.ceil(route.durationSeconds / 60));
    const distancePart =
      typeof route.distanceMeters === "number" &&
      Number.isFinite(route.distanceMeters) &&
      route.distanceMeters >= 0
        ? `khoảng ${formatDistanceVi(route.distanceMeters)}, `
        : "";
    const durationPart = `${vehicleLabel} chừng ${formatDurationVi(driveMinutes)}`;

    const dayDiff = calendarDayDiff(todayVn, targetEntry.localDate);
    let leaveAdvice: string;
    if (isInProgressOnly || (dayDiff === 0 && targetVisit.startMinute - driveMinutes <= nowMin)) {
      const arrivalMin = nowMin + driveMinutes;
      const arrivalText =
        arrivalMin < 1440
          ? minuteClockLabel(arrivalMin)
          : `${minuteClockLabel(arrivalMin % 1440)} ngày hôm sau`;
      leaveAdvice = `bạn nên xuất phát ngay (nếu đi lúc ${minuteClockLabel(nowMin)} dự kiến tới khoảng ${arrivalText})`;
    } else if (targetVisit.startMinute - driveMinutes >= 0) {
      leaveAdvice = `nên đi trước ${minuteClockLabel(targetVisit.startMinute - driveMinutes)}`;
    } else {
      leaveAdvice = `nên xuất phát từ tối hôm trước (khoảng ${minuteClockLabel(1440 + targetVisit.startMinute - driveMinutes)})`;
    }

    return {
      kind: "ADVISED",
      advice: `Điểm tiếp theo là ${targetName}, ${whenLabel}. Từ chỗ bạn tới điểm này (theo vị trí bạn vừa chia sẻ) ${distancePart}${durationPart}, ${leaveAdvice}.`,
      suggestions: [],
    };
  }

  if (parsed.intentMode === "NEARBY_SERVICES") {
    const category = classifyNearbyServiceQuery(foldVi(input.message)) ?? {
      query: "quán ăn",
      label: "dịch vụ",
      allowLodging: true,
    };
    const searchResult = await searchNearbyServicesFromPlaces({
      places: input.places,
      category,
      location: input.location,
      signal: input.signal,
    });

    if (searchResult.status !== "RESULTS") {
      if (searchResult.status === "UNAVAILABLE") {
        return {
          kind: "ADVISED",
          advice: `Theo vị trí bạn vừa chia sẻ, hiện hệ thống chưa tra cứu được danh sách ${category.label} quanh đây từ Google Maps (dịch vụ tìm địa điểm tạm thời chưa sẵn sàng). Mình chưa thể nêu tên điểm hay giờ mở cửa cụ thể; bạn hãy thử lại sau hoặc tra trực tiếp trên Google Maps.`,
          suggestions: [],
        };
      }
      return {
        kind: "ADVISED",
        advice: `Theo vị trí bạn vừa chia sẻ, trong bán kính tới ${NEARBY_SERVICE_RADII_KM[NEARBY_SERVICE_RADII_KM.length - 1]} km chưa thấy ${category.label} phù hợp trên dữ liệu từ Google Maps, chưa kiểm tra; giờ mở cửa thực tế có thể khác.`,
        suggestions: [],
      };
    }

    const hasAnyOpeningHours = searchResult.places.some(
      ({ place }) => typeof place.openNow === "boolean" || (place.openingHours?.length ?? 0) > 0,
    );

    const lines = searchResult.places.map(({ place, distKm }) => {
      const displayName = cleanPlaceDisplayName(place.name) || place.name;
      const distLabel = formatDistanceVi(Math.round(distKm * 1000));
      const hourDetails: string[] = [];
      if (place.openingHours && place.openingHours.length > 0) {
        hourDetails.push(`giờ mở cửa ghi nhận: ${place.openingHours[0]}`);
      } else if (typeof place.openNow === "boolean") {
        hourDetails.push(place.openNow ? "trạng thái hiện tại: đang mở" : "trạng thái hiện tại: đang đóng");
      }
      return `- ${displayName} (cách ~${distLabel}${hourDetails.length > 0 ? `, ${hourDetails.join(", ")}` : ""})`;
    });

    const missingHoursNote = hasAnyOpeningHours
      ? ""
      : " Dữ liệu trả về hiện chưa có giờ mở cửa cụ thể nên chưa xác nhận được quán còn mở hay không.";

    return {
      kind: "ADVISED",
      advice: `Theo vị trí bạn vừa chia sẻ (quanh bán kính ${searchResult.radiusKm} km, gợi ý từ Google Maps, chưa kiểm tra; giờ mở cửa thực tế có thể khác), có một số ${category.label} gần bạn:\n${lines.join("\n")}\n${missingHoursNote} Đây chỉ là gợi ý tham khảo, chưa thêm vào lịch trình; nếu muốn đưa điểm nào vào lịch, bạn có thể gửi yêu cầu chỉnh sửa lịch để kiểm tra và xác nhận riêng.`.replace(
        /\n\s+/gu,
        "\n",
      ),
      suggestions: [],
    };
  }

  const todayObj =
    (input.baseCandidate.startDate
      ? input.baseCandidate.days.find(
          (d) => tripDayDate(input.baseCandidate.startDate, d.dayIndex) === todayVn,
        )
      : undefined) ??
    input.baseCandidate.days.find((d) =>
      d.visits.some((v) => !input.lockedVisitIds.has(v.visitId)),
    ) ??
    input.baseCandidate.days[0];

  if (!todayObj) {
    return { kind: "NOT_APPLICABLE" };
  }

  const unlockedToday = todayObj.visits.filter((v) => !input.lockedVisitIds.has(v.visitId));
  const lastLockedToday = [...todayObj.visits]
    .reverse()
    .find((v) => input.lockedVisitIds.has(v.visitId));
  const earliestAllowedNext = Math.max(
    nowMin + 5,
    lastLockedToday
      ? lastLockedToday.startMinute + lastLockedToday.plannedDurationMinutes + 15
      : nowMin + 5,
  );
  const weatherDigest = await gatherWeatherAndSunDigest({
    candidate: input.baseCandidate,
    placeNames: input.placeNames,
    catalogById,
    database: input.database,
    forecast: input.forecast,
    now: input.timeReference,
  });

  if (parsed.intentMode === "NEARBY_OPTIONS") {
    const totalVisits = input.baseCandidate.days.reduce((s, d) => s + d.visits.length, 0);
    if (totalVisits >= MAX_EDIT_VISITS) {
      return {
        kind: "ADVISED",
        advice: `Chuyến đi đã đạt trần tối đa ${MAX_EDIT_VISITS} lượt tham quan nên chưa thể thêm điểm mới.`,
        suggestions: [],
      };
    }

    const inDraftIds = new Set(
      input.baseCandidate.days.flatMap((d) => d.visits.map((v) => v.destinationId)),
    );
    const nearbyRanked = input.eligibleDestinations
      .filter(
        (d) =>
          !inDraftIds.has(d.id) &&
          typeof d.latitude === "number" &&
          typeof d.longitude === "number",
      )
      .map((d) => ({
        dest: d,
        distKm: haversineKm(
          input.location!.latitude,
          input.location!.longitude,
          d.latitude!,
          d.longitude!,
        ),
      }))
      .sort((a, b) => a.distKm - b.distKm)
      .slice(0, 4);

    const blueprints: RemedyBlueprint[] = [];
    const augmentedNames = new Map(input.placeNames);
    const nearbyLines: string[] = [];

    for (const item of nearbyRanked) {
      if (blueprints.length >= 3) break;
      const route = await input.getRoute({
        origin: {
          latitude: input.location.latitude,
          longitude: input.location.longitude,
        },
        destination: {
          latitude: item.dest.latitude!,
          longitude: item.dest.longitude!,
        },
        vehicle: input.baseCandidate.transport,
      });
      const driveMins =
        route.kind === "ok" && typeof route.durationSeconds === "number"
          ? Math.ceil(route.durationSeconds / 60)
          : Math.max(10, Math.round(item.distKm * 2.5));
      const eta = Math.max(earliestAllowedNext, nowMin + driveMins);
      const dur = Math.max(
        30,
        item.dest.suggestedDurationMinutes ?? item.dest.minimumDurationMinutes ?? 60,
      );
      if (eta + dur > 1440) continue;

      augmentedNames.set(item.dest.id, item.dest.name);
      const insertPos =
        todayObj.visits.filter((v) => v.startMinute < eta).length + 1;
      const lockedCount = todayObj.visits.filter((v) =>
        input.lockedVisitIds.has(v.visitId),
      ).length;
      const safePos = Math.max(lockedCount + 1, insertPos);
      const newVisitId = input.createVisitId();
      let cand = addVisit(
        input.baseCandidate,
        todayObj.dayIndex,
        {
          visitId: newVisitId,
          destinationId: item.dest.id,
          startMinute: eta,
          plannedDurationMinutes: dur,
        },
        safePos,
      );
      const shifted = autoShiftDayVisits({
        candidate: cand,
        dayIndex: todayObj.dayIndex,
        startFromIndex: Math.max(0, safePos - 1),
        legMetrics: input.baselinePreview.legs ?? [],
        lockedVisitIds: input.lockedVisitIds,
      });
      if (shifted.overflowDayIndex === null) cand = shifted.candidate;
      nearbyLines.push(
        `${item.dest.name} (cách ~${driveMins} phút di chuyển, ghé lúc ${minuteClockLabel(eta)})`,
      );
      blueprints.push({
        title: `Ghé thêm ${item.dest.name} (~${driveMins} phút từ vị trí hiện tại)`,
        summary: `Dự kiến có mặt lúc ${minuteClockLabel(eta)} (thời lượng ${dur} phút), giữ nguyên toàn bộ các lượt đã hoàn thành.`,
        candidate: cand,
        addedPlaceDetails: { [item.dest.id]: toAddedPlaceDetail(item.dest) },
      });
    }

    const cards = await dryRunAdvisoryRemedies({
      blueprints,
      baseCandidate: input.baseCandidate,
      savedShape: input.savedShape,
      baselineValidation: input.baselinePreview.validation,
      baselineSaveEligibility: input.baselinePreview.saveEligibility,
      baseWeatherAndSun: weatherDigest,
      placeNames: augmentedNames,
      catalogById,
      runPreview: input.runPreview,
      timeReference: input.timeReference,
      maxSuggestions: 3,
    });

    const deterministic =
      nearbyLines.length > 0
        ? `Từ vị trí hiện tại của bạn, có thể ghé các điểm công khai gần nhất trong Ngày ${todayObj.dayIndex}: ${nearbyLines.join("; ")}. Các lượt đã qua giờ được giữ cố định hoàn toàn.`
        : `Từ vị trí và quỹ thời gian còn lại hôm nay (từ ${minuteClockLabel(nowMin)}), chưa có điểm công khai mới nào phù hợp trước cuối ngày.`;

    return {
      kind: "ADVISED",
      advice: deterministic,
      suggestions: cards,
    };
  }

  // TRAFFIC_RECOVER: compute route from current GPS/manual coordinates to remaining unlocked visits today
  if (unlockedToday.length === 0) {
    const { upcoming } = findChronologicalNextVisit({
      baseCandidate: input.baseCandidate,
      lockedVisitIds: input.lockedVisitIds,
      todayVn,
      nowMin,
    });
    if (upcoming) {
      const nextName = input.placeNames.get(upcoming.visit.destinationId) ?? "điểm tiếp theo";
      const whenLabel = formatScheduledNextTimeVi(
        upcoming.localDate,
        todayVn,
        upcoming.dayIndex,
        upcoming.visit.startMinute,
      );
      return {
        kind: "ADVISED",
        advice: `Các lượt trong Ngày ${todayObj.dayIndex} đã qua giờ và được giữ cố định. Theo vị trí bạn vừa chia sẻ, lượt sắp tới tiếp theo là ${nextName}, ${whenLabel}; bạn có thể hỏi khoảng cách hoặc thời gian di chuyển tới điểm này.`,
        suggestions: [],
      };
    }
    return {
      kind: "ADVISED",
      advice: `Toàn bộ các lượt tham quan trong Ngày ${todayObj.dayIndex} đã qua giờ và được khóa cố định. Bạn có thể hỏi gợi ý điểm gần vị trí hiện tại hoặc xem lịch Ngày kế tiếp.`,
      suggestions: [],
    };
  }

  const firstRemaining = unlockedToday[0]!;
  const firstDest = catalogById.get(firstRemaining.destinationId);
  let outboundDriveMinutes = 20;
  if (
    firstDest &&
    typeof firstDest.latitude === "number" &&
    typeof firstDest.longitude === "number"
  ) {
    const route = await input.getRoute({
      origin: {
        latitude: input.location.latitude,
        longitude: input.location.longitude,
      },
      destination: {
        latitude: firstDest.latitude,
        longitude: firstDest.longitude,
      },
      vehicle: input.baseCandidate.transport,
    });
    if (route.kind === "ok" && typeof route.durationSeconds === "number") {
      outboundDriveMinutes = Math.ceil(route.durationSeconds / 60);
    }
  }

  const firstEta = Math.max(earliestAllowedNext, nowMin + outboundDriveMinutes);
  const firstName = input.placeNames.get(firstRemaining.destinationId) ?? "điểm tiếp theo";

  // Build shifted candidate preserving all locked visits
  const firstUnlockedIdx = todayObj.visits.findIndex(
    (v) => v.visitId === firstRemaining.visitId,
  );
  const shiftedStart = Math.max(firstRemaining.startMinute, firstEta);
  let recovered = setVisitTime(
    input.baseCandidate,
    firstRemaining.visitId,
    Math.min(1439 - firstRemaining.plannedDurationMinutes, shiftedStart),
  );
  const repacked = autoShiftDayVisits({
    candidate: recovered,
    dayIndex: todayObj.dayIndex,
    startFromIndex: Math.max(0, firstUnlockedIdx),
    legMetrics: input.baselinePreview.legs ?? [],
    lockedVisitIds: input.lockedVisitIds,
  });
  recovered = repacked.candidate;

  const recoveryBlueprints: RemedyBlueprint[] = [
    {
      title: `Cập nhật phần còn lại Ngày ${todayObj.dayIndex} từ ${minuteClockLabel(shiftedStart)}`,
      summary: `Tính khoảng ${outboundDriveMinutes} phút từ vị trí hiện tại tới ${firstName} và giữ nguyên các lượt đã qua giờ.`,
      candidate: recovered,
    },
  ];

  // If multiple unlocked visits remain and shifted schedule risks lateness/sunset/closure, also build drop-last relief option
  const lastUnlocked = [...unlockedToday].reverse()[0];
  if (unlockedToday.length >= 2 && lastUnlocked && lastUnlocked.visitId !== firstRemaining.visitId) {
    const lastUnlockedName = input.placeNames.get(lastUnlocked.destinationId) ?? "điểm cuối ngày";
    const trimmedLast = removeVisit(recovered, lastUnlocked.visitId);
    recoveryBlueprints.push({
      title: `Dời phần còn lại từ ${minuteClockLabel(shiftedStart)} và bỏ bớt ${lastUnlockedName}`,
      summary: `Ưu tiên đi kịp các lượt chính còn lại trước giờ đóng cửa / hoàng hôn.`,
      candidate: trimmedLast,
    });
  }

  const cards = await dryRunAdvisoryRemedies({
    blueprints: recoveryBlueprints,
    baseCandidate: input.baseCandidate,
    savedShape: input.savedShape,
    baselineValidation: input.baselinePreview.validation,
    baselineSaveEligibility: input.baselinePreview.saveEligibility,
    baseWeatherAndSun: weatherDigest,
    placeNames: input.placeNames,
    catalogById,
    runPreview: input.runPreview,
    timeReference: input.timeReference,
    maxSuggestions: 2,
  });

  const localDate = tripDayDate(input.baseCandidate.startDate, todayObj.dayIndex);
  const sunsetNote =
    localDate &&
    firstDest?.isOutdoor &&
    typeof firstDest.latitude === "number" &&
    typeof firstDest.longitude === "number"
      ? computeSunTimes(firstDest.latitude, firstDest.longitude, localDate).sunsetMinute
      : null;

  const fallbackText = `Từ vị trí hiện tại lúc ${minuteClockLabel(nowMin)}, cần khoảng ${outboundDriveMinutes} phút để di chuyển tới ${firstName} (dự kiến có mặt từ ${minuteClockLabel(firstEta)}). Còn ${unlockedToday.length} điểm chưa hoàn thành trong Ngày ${todayObj.dayIndex}; toàn bộ các lượt đã qua giờ và nơi xuất phát ban đầu vẫn được giữ cố định.${sunsetNote !== null ? ` Giờ hoàng hôn tham khảo: ${formatMinute(sunsetNote)}.` : ""} Bạn có thể bấm áp dụng phương án bên dưới vào bản nháp.`;

  const facts = buildVerifiedAdvisoryFacts({
    candidate: input.baseCandidate,
    placeNames: input.placeNames,
    placeDetailsById: input.placeDetailsById,
    validation: input.baselinePreview.validation,
    legs: input.baselinePreview.legs ?? [],
    journeySummary: input.baselinePreview.journeySummary,
    saveEligibility: input.baselinePreview.saveEligibility,
    weatherAndSun: weatherDigest,
    suggestions: cards,
    focusDayIndex: todayObj.dayIndex,
    topic: "LOCATION_GUIDANCE",
  });

  const advice = await composeGroundedAdviceWithFallback({
    message: `${input.message}\n[Vị trí hiện tại đã xác nhận: dự kiến ${outboundDriveMinutes} phút tới ${firstName} lúc ${minuteClockLabel(firstEta)}, giữ nguyên ${input.lockedVisitIds.size} lượt đã hoàn thành]`,
    facts,
    fallbackText,
    knownDestinationIds: new Set(input.allCatalogDestinations.map((d) => d.id)),
    llm: input.llm,
  });

  return {
    kind: "ADVISED",
    advice,
    suggestions: cards,
  };
}
