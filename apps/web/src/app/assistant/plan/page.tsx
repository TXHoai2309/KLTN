import { redirect } from "next/navigation";
import type { Route } from "next";

export const dynamic = "force-dynamic";

/** Single assistant entry at `/assistant` (ADR-43 §1): legacy `/assistant/plan` redirects directly. */
export default function LegacyAssistantPlanRedirectPage() {
  redirect("/assistant" as Route);
}
