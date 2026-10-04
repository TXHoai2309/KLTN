import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { requireActor } from "@/server/authorization/guard";
import { authorizationDependencies } from "@/server/authorization/server";
import { AppError } from "@/server/http/app-error";
import { buildAuthLoginHref } from "@/lib/auth-return-to";
export async function destinationPageAccess(path: string): Promise<boolean> {
  try { await requireActor(await headers(), authorizationDependencies, "admin"); return true; }
  catch (error) {
    if (error instanceof AppError && error.status === 401) redirect(buildAuthLoginHref(path) as Route);
    if (error instanceof AppError && error.status === 403) return false;
    throw error;
  }
}
