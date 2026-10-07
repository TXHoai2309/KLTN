import AccessDenied from "@/components/access-denied";
import { culturePageAccess } from "../../page-access";
import CultureForm from "../../culture-form";
import { validateCultureId } from "@/modules/culture/culture-service";
import { notFound } from "next/navigation";
import "../../culture.css";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!await culturePageAccess(`/admin/culture/${id}/edit`)) return <AccessDenied />;
  try { validateCultureId(id); } catch { notFound(); }
  return <CultureForm id={id} />;
}
