import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Route } from "next";

import AccessDenied from "@/components/access-denied";
import { buildAuthLoginHref } from "@/lib/auth-return-to";
import { AppError } from "@/server/http/app-error";
import { requireActor } from "@/server/authorization/guard";
import { authorizationDependencies } from "@/server/authorization/server";
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

  return allowed ? <TripRequirementForm /> : <AccessDenied />;
}

