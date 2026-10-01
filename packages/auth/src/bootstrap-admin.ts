import type { Database } from "@KLTN/db";

import type { createAuth } from "./index";

type AuthInstance = ReturnType<typeof createAuth>;

export type BootstrapAdminInput = {
  name: string;
  email: string;
  password: string;
};

export type BootstrapAdminResult = {
  created: boolean;
  userId: string;
};

export class ExistingTravelerAccountError extends Error {
  constructor(email: string) {
    super(
      `The email ${email} already belongs to a TRAVELER. Refusing to promote it to ADMIN.`,
    );
    this.name = "ExistingTravelerAccountError";
  }
}

export async function bootstrapInitialAdmin(
  auth: AuthInstance,
  database: Database,
  input: BootstrapAdminInput,
): Promise<BootstrapAdminResult> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();

  if (!name || !email || !input.password) {
    throw new Error("Admin name, email, and password are required.");
  }

  const existingUser = await database.user.findUnique({ where: { email } });
  if (existingUser) {
    if (existingUser.role === "ADMIN") {
      return { created: false, userId: existingUser.id };
    }

    throw new ExistingTravelerAccountError(email);
  }

  let createdUser: Awaited<ReturnType<AuthInstance["api"]["signUpEmail"]>>["user"];
  try {
    const signup = await auth.api.signUpEmail({
      body: { name, email, password: input.password },
    });
    createdUser = signup.user;
  } catch (error) {
    const userAfterSignup = await database.user.findUnique({ where: { email } });
    if (userAfterSignup?.role === "ADMIN") {
      return { created: false, userId: userAfterSignup.id };
    }
    if (userAfterSignup) {
      throw new ExistingTravelerAccountError(email);
    }
    throw error;
  }

  try {
    await database.$transaction(async (transaction) => {
      const promotion = await transaction.user.updateMany({
        where: { id: createdUser.id, role: "TRAVELER" },
        data: { role: "ADMIN" },
      });

      if (promotion.count !== 1) {
        const currentUser = await transaction.user.findUnique({
          where: { id: createdUser.id },
          select: { role: true },
        });
        if (currentUser?.role !== "ADMIN") {
          throw new Error("New user could not be assigned the ADMIN role.");
        }
      }

      await transaction.session.deleteMany({
        where: { userId: createdUser.id },
      });
    });
  } catch (error) {
    try {
      await database.session.deleteMany({
        where: { userId: createdUser.id },
      });
    } catch {
      throw new AggregateError(
        [error],
        "Admin role assignment failed, and the bootstrap session could not be cleaned up.",
      );
    }

    throw new Error(
      "Admin role assignment failed. The newly created account remains TRAVELER; inspect it before retrying.",
      { cause: error },
    );
  }

  return { created: true, userId: createdUser.id };
}
