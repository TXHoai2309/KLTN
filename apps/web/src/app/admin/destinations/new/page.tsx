import AccessDenied from "@/components/access-denied";
import { destinationPageAccess } from "../page-access";
import DestinationForm from "../destination-form";
import "../destinations.css";
export default async function Page() {
  if (!await destinationPageAccess("/admin/destinations/new")) return <AccessDenied />;
  return <DestinationForm id={null} />;
}
