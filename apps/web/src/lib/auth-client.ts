import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { auth } from "../services";
import { fetchAuthWithTimeout } from "./auth-fetch";

export const authClient = createAuthClient({
  fetchOptions: { customFetchImpl: fetchAuthWithTimeout, retry: 0 },
  plugins: [inferAdditionalFields<typeof auth>()],
});
