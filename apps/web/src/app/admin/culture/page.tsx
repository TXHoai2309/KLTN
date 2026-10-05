import AccessDenied from "@/components/access-denied";
import { culturePageAccess } from "./page-access";
import CultureList from "./culture-list";
import "./culture.css";
export default async function Page() {
  if (!await culturePageAccess("/admin/culture")) return <AccessDenied />;
  return <CultureList />;
}
