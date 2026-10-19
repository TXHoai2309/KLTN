import AccessDenied from "@/components/access-denied";
import { userManagementPageAccess } from "../page-access";
import UserDetailClient from "./user-detail-client";

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const hasAccess = await userManagementPageAccess(`/admin/users/${id}`);
  if (!hasAccess) {
    return <AccessDenied />;
  }

  return <UserDetailClient userId={id} />;
}
