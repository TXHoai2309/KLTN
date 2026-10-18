import { describe, expect, it } from "vitest";

import {
  AUTH_INTENT_CONFIGS,
  resolveAuthIntentConfig,
  resolveIntentReturnTo,
  type AuthIntent,
} from "./auth-intent-config";

describe("auth-intent-config", () => {
  it("defines distinct contextual copy and icons for each supported intent", () => {
    const intents: AuthIntent[] = [
      "favorites",
      "planner",
      "trips",
      "trip_save",
      "dashboard",
      "account",
      "session_expired",
      "generic",
    ];

    for (const intent of intents) {
      const config = AUTH_INTENT_CONFIGS[intent];
      expect(config).toBeDefined();
      expect(config.title.length).toBeGreaterThan(5);
      expect(config.description.length).toBeGreaterThan(15);
      expect(config.defaultReturnTo.startsWith("/")).toBe(true);
      expect(config.iconName).toBeDefined();
    }

    // Verify specific Vietnamese text invariants
    expect(AUTH_INTENT_CONFIGS.favorites.title).toBe("Lưu những nơi bạn yêu thích");
    expect(AUTH_INTENT_CONFIGS.favorites.description).toContain("lưu điểm đến");

    expect(AUTH_INTENT_CONFIGS.planner.title).toBe("Sẵn sàng lên kế hoạch khám phá?");
    expect(AUTH_INTENT_CONFIGS.planner.description).toContain("xây dựng hành trình");

    expect(AUTH_INTENT_CONFIGS.trips.title).toBe("Xem lại những hành trình của bạn");
    expect(AUTH_INTENT_CONFIGS.trips.description).toContain("truy cập các chuyến đi đã lưu");

    expect(AUTH_INTENT_CONFIGS.trip_save.title).toBe("Lưu hành trình của bạn");
    expect(AUTH_INTENT_CONFIGS.trip_save.description).toContain("xác nhận và lưu chuyến đi");

    expect(AUTH_INTENT_CONFIGS.dashboard.title).toBe("Truy cập không gian cá nhân");
    expect(AUTH_INTENT_CONFIGS.account.title).toBe("Truy cập không gian cá nhân");

    expect(AUTH_INTENT_CONFIGS.session_expired.title).toBe("Phiên đăng nhập đã hết hạn");
    expect(AUTH_INTENT_CONFIGS.session_expired.description).toBe("Vui lòng đăng nhập lại để tiếp tục.");
  });

  it("resolves fallback to generic for unknown or missing intents", () => {
    expect(resolveAuthIntentConfig(null).intent).toBe("generic");
    expect(resolveAuthIntentConfig(undefined).intent).toBe("generic");
    expect(resolveAuthIntentConfig("unknown_feature").intent).toBe("generic");
    expect(resolveAuthIntentConfig("favorites").intent).toBe("favorites");
  });

  it("resolves returnTo with safety checks", () => {
    expect(resolveIntentReturnTo("favorites")).toBe("/favorites");
    expect(resolveIntentReturnTo("planner")).toBe("/trips/new");
    expect(resolveIntentReturnTo("trips")).toBe("/trips");
    expect(resolveIntentReturnTo("favorites", "/destinations/dong-van")).toBe("/destinations/dong-van");
    // Strips malicious open-redirect URLs
    expect(resolveIntentReturnTo("favorites", "https://evil.com")).toBe("/dashboard");
    expect(resolveIntentReturnTo("favorites", "//evil.com")).toBe("/dashboard");
  });
});
