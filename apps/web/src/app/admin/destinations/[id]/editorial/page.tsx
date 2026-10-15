import AccessDenied from "@/components/access-denied";
import { destinationPageAccess } from "../../page-access";
import EditorialEditor from "../../editorial-editor";
import { validateDestinationId } from "@/modules/destination/destination-service";
import { notFound } from "next/navigation";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!await destinationPageAccess(`/admin/destinations/${id}/editorial`)) return <AccessDenied />;
  try { validateDestinationId(id); } catch { notFound(); }
  return <EditorialEditor id={id} />;
}
