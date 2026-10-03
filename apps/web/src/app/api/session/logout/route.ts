import { NextResponse } from "next/server";

import { strictLogout } from "@/modules/auth/strict-logout";
import { auth, db } from "@/services";

const LOGOUT_UNKNOWN_MESSAGE =
  "Chưa thể xác nhận đăng xuất. Vui lòng thử lại.";

export async function POST(request: Request) {
  const outcome = await strictLogout(request.headers, {
    resolveSession: (headers) => auth.api.getSession({ headers }),
    signOut: async (headers) => {
      // Router dispatch prevents nextCookies from applying Set-Cookie before DB verification.
      const signOutHeaders = new Headers(headers);
      signOutHeaders.set("content-type", "application/json");
      const signOutResponse = await auth.handler(
        new Request(new URL("/api/auth/sign-out", request.url), {
          method: "POST",
          headers: signOutHeaders,
          body: "{}",
        }),
      );
      const result: unknown = await signOutResponse.clone().json().catch(() => null);
      const succeeded =
        typeof result === "object" &&
        result !== null &&
        "success" in result &&
        result.success === true;

      return {
        headers: signOutResponse.headers,
        response: { success: signOutResponse.ok && succeeded },
      };
    },
    findSession: (id) =>
      db.session.findUnique({ where: { id }, select: { id: true } }),
    deleteSession: (id) => db.session.delete({ where: { id } }),
  });

  if (outcome.status !== "SUCCESS") {
    return NextResponse.json(
      {
        success: false,
        operationStatus: outcome.status,
        error: {
          code: "LOGOUT_NOT_CONFIRMED",
          message: LOGOUT_UNKNOWN_MESSAGE,
        },
        retry: true,
      },
      { status: 503 },
    );
  }

  const response = NextResponse.json({
    success: true,
    operationStatus: "SUCCESS",
  });

  for (const cookie of outcome.headers.getSetCookie()) {
    response.headers.append("set-cookie", cookie);
  }

  return response;
}
