import type { Database } from "@KLTN/db";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { APIError } from "better-auth/api";

export type AuthConfig = {
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
};

export function createAuth(env: AuthConfig, database: Database) {
  return betterAuth({
    database: prismaAdapter(database, {
      provider: "postgresql",
    }),
    // Revocation always consults database storage, including provider endpoints.
    session: { cookieCache: { enabled: false } },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const user = await database.user.findUnique({ where: { id: session.userId }, select: { status: true } });
            if (!user || user.status !== "ACTIVE") {
              throw new APIError("FORBIDDEN", { code: "ACCOUNT_LOCKED", message: "Tài khoản không được phép đăng nhập." });
            }
          },
        },
      },
    },
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
    trustedOrigins: Array.from(
      new Set([
        env.BETTER_AUTH_URL,
        env.BETTER_AUTH_URL.replace("localhost", "127.0.0.1"),
        env.BETTER_AUTH_URL.replace("127.0.0.1", "localhost"),
      ])
    ),
    emailAndPassword: { enabled: true },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    plugins: [nextCookies()],
  });
}

export type Session = ReturnType<typeof createAuth>["$Infer"]["Session"];
