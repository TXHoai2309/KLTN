import AccessDenied from "@/components/access-denied";
import { destinationPageAccess } from "./page-access";
import DestinationList from "./destination-list";
import "./destinations.css";
export default async function Page() {
  if (!await destinationPageAccess("/admin/destinations")) return <AccessDenied />;
  return <DestinationList />;
}
