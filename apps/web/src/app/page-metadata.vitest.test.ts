import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/http/app-error";

describe("P2: Browser tab titles & private metadata boundaries", () => {
  const mocks = {
    getPublicDestination: vi.fn(),
    readPublicEditorial: vi.fn(),
    getMyTrip: vi.fn(),
    headers: vi.fn(async () => new Headers()),
    applicationSettings: vi.fn(async () => ({ calendar: false })),
  };

  let rootMetadata: typeof import("./layout").metadata;
  let exploreMetadata: typeof import("./explore/page").metadata;
  let favoritesMetadata: typeof import("./favorites/page").metadata;
  let tripsMetadata: typeof import("./trips/page").metadata;
  let assistantMetadata: typeof import("./assistant/page").metadata;
  let generateDestinationMetadata: typeof import("./destinations/[id]/page").generateMetadata;
  let generateTripMetadata: typeof import("./trips/[id]/page").generateMetadata;

  beforeAll(async () => {
    vi.resetModules();
    vi.doMock("next/headers", () => ({ headers: mocks.headers }));
    vi.doMock("next/font/google", () => ({
      Geist: () => ({ variable: "--font-geist-sans" }),
      Geist_Mono: () => ({ variable: "--font-geist-mono" }),
      Be_Vietnam_Pro: () => ({ variable: "--font-be-vietnam" }),
      Lora: () => ({ variable: "--font-lora" }),
    }));
    vi.doMock("@KLTN/ui/styles/globals.css", () => ({}));
    vi.doMock("./index.css", () => ({}));
    vi.doMock("../index.css", () => ({}));
    vi.doMock("../components/assistant/assistant.css", () => ({}));
    vi.doMock("../components/assistant/destination-panel.css", () => ({}));
    vi.doMock("../components/assistant/assistant-launcher.css", () => ({}));
    vi.doMock("./explore/explore.css", () => ({}));
    vi.doMock("./destinations/[id]/detail.css", () => ({}));
    vi.doMock("./trips/trips.css", () => ({}));
    vi.doMock("@/components/providers", () => ({ default: () => null }));
    vi.doMock("@/components/header", () => ({ default: () => null }));
    vi.doMock("@/components/assistant/global-assistant", () => ({ GlobalAssistant: () => null }));
    vi.doMock("@/services", () => ({ db: {}, auth: {} }));
    vi.doMock("@/modules/destination/public-destination-service", () => ({
      getPublicDestination: mocks.getPublicDestination,
    }));
    vi.doMock("@/modules/destination-editorial/editorial-service", () => ({
      readPublicEditorial: mocks.readPublicEditorial,
    }));
    vi.doMock("@/modules/trip-read/trip-read-service", () => ({
      getMyTrip: mocks.getMyTrip,
    }));
    vi.doMock("@/modules/trip-read/trip-read-server", () => ({
      tripReadDependencies: {},
    }));
    vi.doMock("@/modules/runtime-config/runtime-config-service", () => ({
      applicationSettings: mocks.applicationSettings,
    }));
    vi.doMock("./destinations/[id]/destination-detail", () => ({
      default: () => null,
      DetailState: () => null,
    }));
    vi.doMock("./explore/destination-search-form", () => ({ default: () => null }));
    vi.doMock("./favorites/favorites-view", () => ({ default: () => null }));
    vi.doMock("./trips/trips-view", () => ({ MyTripsView: () => null, TripDetailView: () => null }));
    vi.doMock("../components/assistant/assistant-runtime-chat", () => ({ AssistantRuntimeChat: () => null }));
    vi.doMock("../components/assistant/assistant-v2-pending", () => ({ AssistantV2Pending: () => null }));
    vi.doMock("../components/assistant/assistant-answer", () => ({ AssistantShell: () => null }));

    ({ metadata: rootMetadata } = await import("./layout"));
    ({ metadata: exploreMetadata } = await import("./explore/page"));
    ({ metadata: favoritesMetadata } = await import("./favorites/page"));
    ({ metadata: tripsMetadata } = await import("./trips/page"));
    ({ metadata: assistantMetadata } = await import("./assistant/page"));
    ({ generateMetadata: generateDestinationMetadata } = await import("./destinations/[id]/page"));
    ({ generateMetadata: generateTripMetadata } = await import("./trips/[id]/page"));
  });

  afterAll(() => {
    vi.doUnmock("next/headers");
    vi.doUnmock("next/font/google");
    vi.doUnmock("@/services");
    vi.doUnmock("@/modules/destination/public-destination-service");
    vi.doUnmock("@/modules/destination-editorial/editorial-service");
    vi.doUnmock("@/modules/trip-read/trip-read-service");
    vi.doUnmock("@/modules/trip-read/trip-read-server");
    vi.doUnmock("@/modules/runtime-config/runtime-config-service");
    vi.doUnmock("./destinations/[id]/destination-detail");
    vi.resetModules();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets Vietnamese titles across root, explore, favorites, trips, and assistant without KLTN", () => {
    expect(String(rootMetadata.title)).not.toContain("KLTN");
    expect(exploreMetadata.title).toBe("Khám phá điểm đến | Hà Giang Travel Assistant");
    expect(favoritesMetadata.title).toBe("Yêu thích | Hà Giang Travel Assistant");
    expect(tripsMetadata.title).toBe("Chuyến đi của tôi | Hà Giang Travel Assistant");
    expect(assistantMetadata.title).toBe("Trợ lý AI | Hà Giang Travel Assistant");
  });

  it("generates destination title + concise description and safe fallback on unavailable", async () => {
    mocks.getPublicDestination.mockResolvedValueOnce({
      id: "d1",
      name: "Cao nguyên đá Đồng Văn",
      description: "Công viên địa chất toàn cầu UNESCO với cảnh quan núi đá tai mèo kỳ vĩ trải dài bốn huyện vùng cao.",
      profile: {
        shortDescription: "Công viên địa chất toàn cầu UNESCO nổi bật với núi đá vôi hàng trăm triệu năm.",
      },
    });
    const okMeta = await generateDestinationMetadata({ params: Promise.resolve({ id: "d1" }) });
    expect(okMeta.title).toBe("Cao nguyên đá Đồng Văn | Hà Giang Travel Assistant");
    expect(okMeta.description).toContain("Công viên địa chất toàn cầu UNESCO");

    mocks.getPublicDestination.mockRejectedValueOnce(new AppError("DESTINATION_NOT_FOUND", "Not found", 404));
    const missingMeta = await generateDestinationMetadata({ params: Promise.resolve({ id: "missing" }) });
    expect(missingMeta.title).toBe("Chi tiết điểm đến | Hà Giang Travel Assistant");
  });

  it("uses P1-sanitized title for authorized trip detail and never leaks private info on 401/403", async () => {
    mocks.getMyTrip.mockResolvedValueOnce({
      id: "t1",
      startDate: "2026-11-29",
      endDate: "2026-12-03",
      durationDays: 5,
      companionTitle: null,
      pinnedItems: [],
      journey: {
        revision: "v1",
        journey: {
          origin: {
            label: "96 P. Định Công, Hoàng Mai, Hà Nội",
            latitude: 20.985,
            longitude: 105.838,
            source: "GOOGLE_PLACES",
            confirmed: true,
          },
          departureMinute: 420,
          returnDeadlineMinute: 1080,
          returnDepartureMinute: null,
        },
      },
      days: [
        {
          visits: [{ destination: { area: "Đồng Văn" } }],
        },
      ],
    });
    const authedMeta = await generateTripMetadata({ params: Promise.resolve({ id: "t1" }) });
    expect(authedMeta.title).toBe("Hà Nội → Hà Giang, 29/11–3/12 | Hà Giang Travel Assistant");
    expect(String(authedMeta.title)).not.toContain("96");
    expect(String(authedMeta.title)).not.toContain("Định Công");

    for (const status of [401, 403, 404]) {
      mocks.getMyTrip.mockRejectedValueOnce(new AppError("UNAUTHORIZED", "Forbidden", status));
      const deniedMeta = await generateTripMetadata({ params: Promise.resolve({ id: "secret-trip" }) });
      expect(deniedMeta.title).toBe("Chuyến đi | Hà Giang Travel Assistant");
      expect(deniedMeta.description).toBeUndefined();
    }
  });
});
