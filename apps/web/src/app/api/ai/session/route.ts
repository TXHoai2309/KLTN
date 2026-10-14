import { AppError } from "../../../../server/http/app-error";
import { qaPrincipalResolver, qaRuntimeEnabled, qaService } from "../../../../modules/ai/qa-runtime";
import { assertQaSameOrigin, guestCookie } from "../../../../modules/ai/qa-principal";
import { qaHttpError, qaJson } from "../../../../modules/ai/qa-http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    if (!qaRuntimeEnabled()) throw new AppError("AI_UNAVAILABLE", "Unavailable", 503);
    assertQaSameOrigin(request);
    const { principal, setCookie } = await qaPrincipalResolver.bootstrap(request.headers);
    // Correlation boundary only; never accepted as authorization on another route.
    return qaJson({ success: true, data: { identity: `${principal.kind}:${principal.id}` } }, 200, setCookie ? { "Set-Cookie": setCookie } : {});
  } catch (error) { return qaHttpError(error); }
}
export async function DELETE(request: Request) {
  try {
    if (!qaRuntimeEnabled()) throw new AppError("AI_UNAVAILABLE", "Unavailable", 503);
    assertQaSameOrigin(request);
    const principal = await qaPrincipalResolver.revoke(request.headers);
    await qaService.revokeGuest(principal);
    return qaJson({ success: true, operationStatus: "SUCCESS", data: null }, 200, { "Set-Cookie": guestCookie("", process.env.NODE_ENV !== "development", true) });
  } catch (error) { return qaHttpError(error); }
}
