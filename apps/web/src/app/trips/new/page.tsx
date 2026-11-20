import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Route } from "next";

import AccessDenied from "@/components/access-denied";
import { buildAuthLoginHref } from "@/lib/auth-return-to";
import { AppError } from "@/server/http/app-error";
import { requireActor } from "@/server/authorization/guard";
import { authorizationDependencies } from "@/server/authorization/server";
import { isTripsageChatEnabled } from "@/modules/tripsage-chat/tripsage-chat-flag";
import TripRequirementForm from "./trip-requirement-form";

export default async function NewTripPage() {
  const allowed = await requireActor(await headers(), authorizationDependencies, "traveler")
    .then(() => true)
    .catch((error: unknown) => {
      if (error instanceof AppError && error.status === 401) {
        redirect(buildAuthLoginHref("/trips/new") as Route);
      }
      if (error instanceof AppError && error.status === 403) return false;
      throw error;
    });

  if (!allowed) return <AccessDenied />;
  // Flag-gated entry to the chat planner; the existing form stays unchanged.
  return isTripsageChatEnabled() ? <><p style={{ textAlign: "center", margin: "12px 0" }}><a href="/assistant?mode=plan">Thử lập hành trình bằng trò chuyện</a></p><TripRequirementForm /></> : <TripRequirementForm />;
}

