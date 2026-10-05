import { resolveAuthReturnTo } from "./auth-return-to";

export type AuthMode = "signin" | "signup";

export function buildAuthModeHref(mode: AuthMode, returnTo: string): string {
  const searchParams = new URLSearchParams({
    mode,
    returnTo: resolveAuthReturnTo(returnTo),
  });

  return `/login?${searchParams.toString()}`;
}
