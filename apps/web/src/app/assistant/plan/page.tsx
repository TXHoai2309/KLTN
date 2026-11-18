import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { Route } from "next";

import AccessDenied from "@/components/access-denied";
import { AssistantShell } from "@/components/assistant/assistant-answer";
import { TripsageChatClient } from "@/components/tripsage-chat/tripsage-chat-client";
import { buildAuthLoginHref } from "@/lib/auth-return-to";
import { isTripsageChatEnabled } from "@/modules/tripsage-chat/tripsage-chat-flag";
import { AppError } from "@/server/http/app-error";
import { requireActor } from "@/server/authorization/guard";
import { authorizationDependencies } from "@/server/authorization/server";
import "@/components/assistant/assistant.css";

export const metadata: Metadata = { title: "Lập hành trình bằng trò chuyện | Hà Giang Travel Assistant" };
// The flag is read per request, never baked in at build time.
export const dynamic = "force-dynamic";

export default async function TripsageChatPage() {
  if (!isTripsageChatEnabled()) notFound();
  const allowed = await requireActor(await headers(), authorizationDependencies, "traveler")
    .then(() => true)
    .catch((error: unknown) => {
      if (error instanceof AppError && error.status === 401) redirect(buildAuthLoginHref("/assistant/plan") as Route);
      if (error instanceof AppError && error.status === 403) return false;
      throw error;
    });
  return allowed ? <AssistantShell><TripsageChatClient /></AssistantShell> : <AccessDenied />;
}
