import AccessDenied from "@/components/access-denied";
import { culturePageAccess } from "../culture/page-access";
import { RagList } from "./rag-review-ui";
import "./rag-review.css";

export default async function Page({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  if (!await culturePageAccess("/admin/rag")) return <AccessDenied />;
  const { view } = await searchParams;
  return <RagList initialView={view === "deleted" ? "deleted" : "active"} />;
}
