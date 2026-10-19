import { adminUserReadResponse } from "@/modules/admin-users/admin-user-http";
import { adminUserDependencies } from "@/modules/admin-users/admin-user-server";
export async function GET(request: Request) {
  return adminUserReadResponse(request, adminUserDependencies, "list");
}
