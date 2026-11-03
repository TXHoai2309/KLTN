import { createAuth } from "@KLTN/auth";
import { createPrismaClient, type Database } from "@KLTN/db";

import { ENV } from "./env.server";

// Next dev re-evaluates server modules after edits. Keep the connection pool
// across those evaluations; query results and authorization are never cached.
const developmentDatabase = Symbol.for("kltn.web.database.development");
// Bump after prisma generate: an instance created mid-generation retains its old runtime model.
const databaseSchemaRevision = "trip-companions-complete-v3";
const processScope = globalThis as typeof globalThis & {
  [developmentDatabase]?: { url: string; client: Database; schemaRevision?: string };
};
const existing = process.env.NODE_ENV === "development" ? processScope[developmentDatabase] : undefined;
export const db = existing?.url === ENV.DATABASE_URL && existing.schemaRevision === databaseSchemaRevision ? existing.client : createPrismaClient(ENV);
if (process.env.NODE_ENV === "development") {
  processScope[developmentDatabase] = { url: ENV.DATABASE_URL, client: db, schemaRevision: databaseSchemaRevision };
}
export const auth = createAuth(ENV, db);
