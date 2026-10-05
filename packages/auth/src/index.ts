import type { Database } from "@KLTN/db";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";

export type AuthConfig = {
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
};

export function createAuth(env: AuthConfig, database: Database) {
  return betterAuth({
    database: prismaAdapter(database, {
      provider: "postgresql",
    }),
    user: {
      additionalFields: {
        role: {
          type: "string",
          required: true,
          defaultValue: "TRAVELER",
          input: false,
        },
      },
      validateUserInfo: ({ user, source }) => {
        if (source.action !== "create-user" || source.method !== "email-password") {
          return;
        }

        if (typeof user.name !== "string" || user.name.length < 2) {
          return {
            error: "INVALID_NAME",
            errorDescription: "Name must be at least 2 characters.",
          };
        }
      },
    },
    trustedOrigins: [env.BETTER_AUTH_URL],
    emailAndPassword: { enabled: true },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    plugins: [nextCookies()],
  });
}

export type Session = ReturnType<typeof createAuth>["$Infer"]["Session"];
