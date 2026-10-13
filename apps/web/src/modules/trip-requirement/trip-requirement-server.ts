import "server-only";

import { authorizationDependencies } from "@/server/authorization/server";
import type { AuthorizationDependencies } from "@/server/authorization/guard";

export type TripRequirementDependencies = {
  authorization: AuthorizationDependencies;
  now: () => Date;
  /** Test-only instrumentation; the production dependency does not set it. */
  onBodyRead?: () => void;
};

export const tripRequirementDependencies: TripRequirementDependencies = {
  authorization: authorizationDependencies,
  now: () => new Date(),
};
