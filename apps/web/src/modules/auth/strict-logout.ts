export type LogoutSession = {
  session: { id: string };
} | null;

export type LogoutProviderResult = {
  headers: Headers;
  response: { success: boolean };
};

export type StrictLogoutDependencies = {
  resolveSession(headers: Headers): Promise<LogoutSession>;
  signOut(headers: Headers): Promise<LogoutProviderResult>;
  findSession(id: string): Promise<{ id: string } | null>;
  deleteSession(id: string): Promise<unknown>;
};

export type StrictLogoutOutcome =
  | { status: "SUCCESS"; headers: Headers }
  | { status: "FAILED" }
  | { status: "UNKNOWN" };

function readSetCookieHeaders(headers: Headers): string[] {
  const headersWithCookieReader = headers as Headers & {
    getSetCookie?: () => string[];
  };

  if (typeof headersWithCookieReader.getSetCookie !== "function") return [];
  return headersWithCookieReader.getSetCookie();
}

export async function strictLogout(
  requestHeaders: Headers,
  dependencies: StrictLogoutDependencies,
): Promise<StrictLogoutOutcome> {
  let currentSession: LogoutSession;
  try {
    currentSession = await dependencies.resolveSession(requestHeaders);
  } catch {
    return { status: "UNKNOWN" };
  }

  if (!currentSession) {
    return { status: "SUCCESS", headers: new Headers() };
  }

  const sessionId = currentSession.session.id;
  let providerResult: LogoutProviderResult | undefined;

  try {
    providerResult = await dependencies.signOut(requestHeaders);
  } catch {
    // The provider can fail after starting the revoke. Still try the scoped DB fallback.
  }

  let remainingSession: { id: string } | null;
  try {
    remainingSession = await dependencies.findSession(sessionId);
  } catch {
    return { status: "UNKNOWN" };
  }

  if (remainingSession) {
    try {
      await dependencies.deleteSession(sessionId);
    } catch {
      return { status: "UNKNOWN" };
    }

    try {
      remainingSession = await dependencies.findSession(sessionId);
    } catch {
      return { status: "UNKNOWN" };
    }
  }

  if (remainingSession) return { status: "FAILED" };
  if (!providerResult?.response.success) return { status: "UNKNOWN" };

  const setCookieHeaders = readSetCookieHeaders(providerResult.headers);
  if (setCookieHeaders.length === 0) return { status: "UNKNOWN" };

  const confirmedHeaders = new Headers();
  for (const cookie of setCookieHeaders) {
    confirmedHeaders.append("set-cookie", cookie);
  }

  return { status: "SUCCESS", headers: confirmedHeaders };
}
