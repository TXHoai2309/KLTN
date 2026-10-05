import { headers } from "next/headers";
import type { Route } from "next";
import { redirect } from "next/navigation";

import { auth, db } from "../../services";
import { requireActor } from "@/server/authorization/guard";
import { AppError } from "@/server/http/app-error";
import AccessDenied from "@/components/access-denied";
import { buildAuthLoginHref } from "@/lib/auth-return-to";
import Dashboard from "./dashboard";

export default async function DashboardPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
    query: { disableCookieCache: true, disableRefresh: true },
  });

  if (!session?.user) {
    redirect(buildAuthLoginHref("/dashboard") as Route);
  }

  const actor = await requireActor(await headers(), {
    database: db, resolveSession: async () => session,
  }).catch((error: unknown) => {
    if (error instanceof AppError && error.status === 401) redirect(buildAuthLoginHref("/dashboard") as Route);
    if (error instanceof AppError && error.status === 403) return null;
    throw error;
  });
  if (!actor) return <AccessDenied />;

  return (
    <div>
      <h1>Dashboard</h1>
      <p>Welcome {session.user.name}</p>
      <Dashboard session={session} />
    </div>
  );
}
