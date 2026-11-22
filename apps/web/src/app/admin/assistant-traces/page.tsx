import AccessDenied from "@/components/access-denied";
import { culturePageAccess } from "../culture/page-access";
import TraceClient from "./trace-client";

export default async function AdminAssistantTracesPage() {
  if (!await culturePageAccess("/admin/assistant-traces")) return <AccessDenied />;
  return <TraceClient />;
}
