import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Route } from "next";

import AccessDenied from "@/components/access-denied";
import { buildAuthLoginHref } from "@/lib/auth-return-to";
import { AppError } from "@/server/http/app-error";
import { requireActor } from "@/server/authorization/guard";
import { authorizationDependencies } from "@/server/authorization/server";
import { applicationSettings } from "@/modules/runtime-config/runtime-config-service";
import TripRequirementForm from "./trip-requirement-form";

export default async function NewTripPage() {
  const actor = await requireActor(await headers(), authorizationDependencies, "traveler")
    .catch((error: unknown) => {
      if (error instanceof AppError && error.status === 401) {
        redirect(buildAuthLoginHref("/trips/new") as Route);
      }
      if (error instanceof AppError && error.status === 403) return null;
      throw error;
    });

  if (!actor) return <AccessDenied />;
  const chatEnabled = await applicationSettings().then(settings => settings.chatEnabled, () => false);
  // Flag-gated entry to the chat planner; the existing form stays unchanged.
  return (
    <>
      {chatEnabled && (
        <p style={{ textAlign: "center", margin: "12px 0" }}>
          <a href="/assistant">Thử lập hành trình bằng trò chuyện</a>
        </p>
      )}
      <TripRequirementForm userId={actor.id} />
    </>
  );
}

