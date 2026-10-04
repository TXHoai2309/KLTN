"use server";

import { headers } from "next/headers";

import { auth } from "@/services";
import { authorizeAuthContextDemoAction } from "@/lib/auth-context-demo";

export async function confirmAuthContextDemoAction() {
  if (process.env.NODE_ENV === "production") {
    return authorizeAuthContextDemoAction(null);
  }

  const session = await auth.api.getSession({ headers: await headers() });
  return authorizeAuthContextDemoAction(session?.user.role);
}
