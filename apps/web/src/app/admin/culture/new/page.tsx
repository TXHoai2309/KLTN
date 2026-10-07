import AccessDenied from "@/components/access-denied";
import { culturePageAccess } from "../page-access";
import CultureForm from "../culture-form";
import "../culture.css";
export default async function Page() {
  if (!await culturePageAccess("/admin/culture/new")) return <AccessDenied />;
  return <CultureForm id={null} />;
}
