import "server-only";
import { db } from "@/services";
import { authorizationDependencies } from "@/server/authorization/server";
import { ragStorage } from "./rag-storage";
export const ragDependencies = { ...authorizationDependencies, database: db, storage: ragStorage };
