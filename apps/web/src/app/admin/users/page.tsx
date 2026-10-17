import AccessDenied from "@/components/access-denied";
import { userManagementPageAccess } from "./page-access";
import UserManagementClient from "./user-management-client";

export default async function AdminUsersPage() {
  const hasAccess = await userManagementPageAccess("/admin/users");
  if (!hasAccess) {
    return <AccessDenied />;
  }

  return <UserManagementClient />;
}
