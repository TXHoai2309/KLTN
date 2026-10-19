export { HttpAdminUserDataSource, AdminUserApiError } from "./admin-user-http-source";
export type { AdminUserDataSource } from "./admin-user-http-source";
import { HttpAdminUserDataSource } from "./admin-user-http-source";
// Both Development and Production use the real API. Fixtures are test/demo-only.
export const defaultAdminUserDataSource = new HttpAdminUserDataSource();
