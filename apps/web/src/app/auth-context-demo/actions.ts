"use server";

import { headers } from "next/headers";

import { authorizeAuthContextDemoAction } from "@/lib/auth-context-demo";
import { requireActor } from "@/server/authorization/guard";
import { authorizationDependencies } from "@/server/authorization/server";
import { AppError } from "@/server/http/app-error";

export async function confirmAuthContextDemoAction() {
  if (process.env.NODE_ENV === "production") {
    return authorizeAuthContextDemoAction(null);
  }

  try {
    const actor = await requireActor(await headers(), authorizationDependencies, "traveler");
    return authorizeAuthContextDemoAction(actor.role);
  } catch (error) {
    if (error instanceof AppError && error.status === 401) return authorizeAuthContextDemoAction(null);
    if (error instanceof AppError && error.status === 403) return { status: "FORBIDDEN" as const, message: "Bạn không có quyền Du khách cho thao tác này." };
    throw error;
  }
}
