import { adminUserMutationResponse } from "@/modules/admin-users/admin-user-http";
import { adminUserDependencies } from "@/modules/admin-users/admin-user-server";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return adminUserMutationResponse(request, adminUserDependencies, (await context.params).id, "lock");
}
