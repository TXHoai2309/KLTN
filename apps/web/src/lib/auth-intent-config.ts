import { DEFAULT_AUTH_RETURN_TO, resolveAuthReturnTo } from "./auth-return-to";

export type AuthIntent =
  | "favorites"
  | "planner"
  | "trips"
  | "trip_save"
  | "dashboard"
  | "account"
  | "session_expired"
  | "generic";

export interface AuthIntentConfig {
  intent: AuthIntent;
  title: string;
  description: string;
  iconName: "heart" | "plus_circle" | "calendar" | "bookmark" | "layout" | "user" | "clock" | "sparkles";
  defaultReturnTo: string;
}

export const AUTH_INTENT_CONFIGS: Record<AuthIntent, AuthIntentConfig> = {
  favorites: {
    intent: "favorites",
    title: "Lưu những nơi bạn yêu thích",
    description: "Đăng nhập để lưu điểm đến và dễ dàng xem lại trong những chuyến đi sau.",
    iconName: "heart",
    defaultReturnTo: "/favorites",
  },
  planner: {
    intent: "planner",
    title: "Sẵn sàng lên kế hoạch khám phá?",
    description: "Đăng nhập để xây dựng hành trình phù hợp với thời gian, sở thích và phương tiện của bạn.",
    iconName: "plus_circle",
    defaultReturnTo: "/trips/new",
  },
  trips: {
    intent: "trips",
    title: "Xem lại những hành trình của bạn",
    description: "Đăng nhập để truy cập các chuyến đi đã lưu và tiếp tục chuẩn bị cho chuyến khám phá tiếp theo.",
    iconName: "calendar",
    defaultReturnTo: "/trips",
  },
  trip_save: {
    intent: "trip_save",
    title: "Lưu hành trình của bạn",
    description: "Đăng nhập để xác nhận và lưu chuyến đi vào tài khoản.",
    iconName: "bookmark",
    defaultReturnTo: "/trips/new",
  },
  dashboard: {
    intent: "dashboard",
    title: "Truy cập không gian cá nhân",
    description: "Đăng nhập để xem và quản lý thông tin thuộc tài khoản của bạn.",
    iconName: "layout",
    defaultReturnTo: "/dashboard",
  },
  account: {
    intent: "account",
    title: "Truy cập không gian cá nhân",
    description: "Đăng nhập để xem và quản lý thông tin thuộc tài khoản của bạn.",
    iconName: "user",
    defaultReturnTo: "/account",
  },
  session_expired: {
    intent: "session_expired",
    title: "Phiên đăng nhập đã hết hạn",
    description: "Vui lòng đăng nhập lại để tiếp tục.",
    iconName: "clock",
    defaultReturnTo: DEFAULT_AUTH_RETURN_TO,
  },
  generic: {
    intent: "generic",
    title: "Đăng nhập để tiếp tục",
    description: "Tính năng này dành cho thành viên Hà Giang Travel Assistant. Đăng nhập hoặc tạo tài khoản để sử dụng và lưu lại trải nghiệm của bạn.",
    iconName: "sparkles",
    defaultReturnTo: DEFAULT_AUTH_RETURN_TO,
  },
};

export function resolveAuthIntentConfig(intent?: string | null): AuthIntentConfig {
  if (!intent) return AUTH_INTENT_CONFIGS.generic;
  if (intent in AUTH_INTENT_CONFIGS) {
    return AUTH_INTENT_CONFIGS[intent as AuthIntent];
  }
  return AUTH_INTENT_CONFIGS.generic;
}

export function resolveIntentReturnTo(intent: AuthIntent, customReturnTo?: string | null): string {
  if (customReturnTo) {
    return resolveAuthReturnTo(customReturnTo);
  }
  const config = AUTH_INTENT_CONFIGS[intent] ?? AUTH_INTENT_CONFIGS.generic;
  return resolveAuthReturnTo(config.defaultReturnTo);
}
