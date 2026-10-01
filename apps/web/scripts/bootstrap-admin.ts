import { bootstrapInitialAdmin } from "@KLTN/auth/bootstrap-admin";
import { createAuth } from "@KLTN/auth";
import { createPrismaClient } from "@KLTN/db";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Set ${name} before running auth:bootstrap-admin.`);
  }
  return value;
}

async function main() {
  const db = createPrismaClient({ DATABASE_URL: requiredEnv("DATABASE_URL") });
  try {
    const auth = createAuth(
      {
        BETTER_AUTH_URL: requiredEnv("BETTER_AUTH_URL"),
        BETTER_AUTH_SECRET: requiredEnv("BETTER_AUTH_SECRET"),
      },
      db,
    );
    const result = await bootstrapInitialAdmin(auth, db, {
      name: requiredEnv("INITIAL_ADMIN_NAME"),
      email: requiredEnv("INITIAL_ADMIN_EMAIL"),
      password: requiredEnv("INITIAL_ADMIN_PASSWORD"),
    });

    if (result.created) {
      console.log(`Created initial ADMIN user (${result.userId}).`);
    } else {
      console.log(`ADMIN user already exists (${result.userId}); no changes made.`);
    }
  } finally {
    await db.$disconnect();
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
