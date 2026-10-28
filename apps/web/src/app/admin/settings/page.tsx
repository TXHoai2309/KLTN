import AccessDenied from "@/components/access-denied";
import { culturePageAccess } from "../culture/page-access";
import SettingsClient from "./settings-client";

export default async function AdminSettingsPage() {
  if (!await culturePageAccess("/admin/settings")) return <AccessDenied />;
  return <SettingsClient />;
}
