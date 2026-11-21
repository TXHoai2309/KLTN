import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Route } from "next";

import AccessDenied from "@/components/access-denied";
import { AssistantShell } from "@/components/assistant/assistant-answer";
import { AssistantModeTabs } from "@/components/tripsage-chat/assistant-mode-tabs";
import { TripsageChatClient } from "@/components/tripsage-chat/tripsage-chat-client";
import { buildAuthLoginHref } from "@/lib/auth-return-to";
import { isTripsageChatEnabled } from "@/modules/tripsage-chat/tripsage-chat-flag";
import { enabledTripsageFeatures } from "@/modules/tripsage-chat/tripsage-features";
import { AppError } from "@/server/http/app-error";
import { requireActor } from "@/server/authorization/guard";
import { authorizationDependencies } from "@/server/authorization/server";
import "@/components/assistant/assistant.css";

export const metadata: Metadata = { title: "Lập hành trình bằng trò chuyện | Hà Giang Travel Assistant" };
// The flag is read per request, never baked in at build time.
export const dynamic = "force-dynamic";

/**
 * The planning chat. It is served at `/assistant?mode=plan` (a rewrite in next.config.ts) and still at
 * `/assistant/plan`. Do not redirect to `/assistant?mode=plan` from here: that URL rewrites back to this page.
 */
export default async function TripsageChatPage() {
  // Flag off: send the visitor to the normal assistant (no `mode`, so no rewrite and no loop).
  if (!isTripsageChatEnabled()) redirect("/assistant" as Route);
  const allowed = await requireActor(await headers(), authorizationDependencies, "traveler")
    .then(() => true)
    .catch((error: unknown) => {
      if (error instanceof AppError && error.status === 401) redirect(buildAuthLoginHref("/assistant?mode=plan") as Route);
      if (error instanceof AppError && error.status === 403) return false;
      throw error;
    });
  return allowed ? <AssistantShell><AssistantModeTabs active="plan" /><TripsageChatClient memoryEnabled={enabledTripsageFeatures().has("memory")} /></AssistantShell> : <AccessDenied />;
}
