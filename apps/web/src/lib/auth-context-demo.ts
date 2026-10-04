import { buildAuthLoginHref } from "./auth-return-to";

export type BrowserNavigationContext = {
  pathname: string;
  search: string;
  hash: string;
};

export function buildAuthContextDemoLoginHref(context: BrowserNavigationContext): string {
  return buildAuthLoginHref(`${context.pathname}${context.search}${context.hash}`);
}

export type AuthContextDemoActionResult =
  | { status: "CONFIRMED"; message: string }
  | { status: "UNAUTHENTICATED"; message: string }
  | { status: "FORBIDDEN"; message: string };

export function authorizeAuthContextDemoAction(
  trustedRole: string | null | undefined,
): AuthContextDemoActionResult {
  if (trustedRole === "TRAVELER") {
    return {
      status: "CONFIRMED",
      message: "Đã xác nhận thao tác minh họa. Không có dữ liệu nào được lưu.",
    };
  }

  if (trustedRole === "ADMIN") {
    return {
      status: "FORBIDDEN",
      message: "Tài khoản hiện tại không có quyền Du khách cho thao tác này.",
    };
  }

  return {
    status: "UNAUTHENTICATED",
    message: "Phiên đăng nhập không còn hiệu lực. Vui lòng đăng nhập lại.",
  };
}
