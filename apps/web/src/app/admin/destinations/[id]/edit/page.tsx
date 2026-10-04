import AccessDenied from "@/components/access-denied";
import { destinationPageAccess } from "../../page-access";
import DestinationForm from "../../destination-form";
import { validateDestinationId } from "@/modules/destination/destination-service";
import { notFound } from "next/navigation";
import "../../destinations.css";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!await destinationPageAccess(`/admin/destinations/${id}/edit`)) return <AccessDenied />;
  try { validateDestinationId(id); } catch { notFound(); }
  return <DestinationForm id={id} />;
}
