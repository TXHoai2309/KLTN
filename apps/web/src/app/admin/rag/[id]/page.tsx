import AccessDenied from "@/components/access-denied";
import { culturePageAccess } from "../../culture/page-access";
import { RagDetailView } from "../rag-review-ui";
import "../rag-review.css";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!await culturePageAccess(`/admin/rag/${encodeURIComponent(id)}`)) return <AccessDenied />;
  return <RagDetailView id={id} />;
}
