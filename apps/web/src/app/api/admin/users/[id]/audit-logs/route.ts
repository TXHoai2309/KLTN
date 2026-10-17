import { adminUserReadResponse } from "@/modules/admin-users/admin-user-http";
import { adminUserDependencies } from "@/modules/admin-users/admin-user-server";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return adminUserReadResponse(request, adminUserDependencies, "audit", (await context.params).id);
}
