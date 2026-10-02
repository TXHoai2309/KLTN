import { headers } from "next/headers";
import type { Route } from "next";
import { redirect } from "next/navigation";

import { auth } from "../../services";
import { buildAuthLoginHref } from "@/lib/auth-return-to";
import Dashboard from "./dashboard";

export default async function DashboardPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect(buildAuthLoginHref("/dashboard") as Route);
  }

  return (
    <div>
      <h1>Dashboard</h1>
      <p>Welcome {session.user.name}</p>
      <Dashboard session={session} />
    </div>
  );
}
