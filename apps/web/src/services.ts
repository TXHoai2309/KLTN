import { createAuth } from "@KLTN/auth";
import { createPrismaClient } from "@KLTN/db";

import { ENV } from "./env.server";

export const db = createPrismaClient(ENV);
export const auth = createAuth(ENV, db);
