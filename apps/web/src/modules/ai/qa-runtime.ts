import "server-only";
import { db } from "../../services";
import { authorizationDependencies } from "../../server/authorization/server";
import { createQaPrincipalResolver } from "./qa-principal";
import { createQaConversationStore } from "./qa-conversation-store";
import { createQaRetriever } from "./qa-retrieval";
import { createQaGenerator } from "./qa-generation";
import { createQaService } from "./qa-service";
import { createQaHttpHandlers } from "./qa-http";
import { createQaAbuseGuard, createQaNetworkResolver } from "./qa-abuse";
import { isQaRuntimeEnabled } from "./qa-runtime-gate";

// Owner runtime acceptance + cleanup scheduling + abuse review are pending.
// Preview/local require exact target allowlisting and explicit abuse-control acceptance.
export const qaRuntimeEnabled = () => isQaRuntimeEnabled({
  nodeEnv: process.env.NODE_ENV,
  vercelEnv: process.env.VERCEL_ENV,
  qaRuntimeEnabled: process.env.QA_RUNTIME_ENABLED,
  qaPreviewRuntimeEnabled: process.env.QA_PREVIEW_RUNTIME_ENABLED,
  qaAbuseProtectionAccepted: process.env.QA_ABUSE_PROTECTION_ACCEPTED,
  databaseUrl: process.env.DATABASE_URL,
  allowedDatabaseHost: process.env.QA_RUNTIME_ALLOWED_DATABASE_HOST,
  allowedDatabaseName: process.env.QA_RUNTIME_ALLOWED_DATABASE_NAME,
});
const publicSourceIds = new Set((process.env.QA_PUBLIC_SOURCE_IDS ?? "").split(",").map(value => value.trim()).filter(value => /^[a-zA-Z0-9_-]{1,128}$/u.test(value)));
const abuse = createQaAbuseGuard(db);
const networkId = createQaNetworkResolver({ secret: () => process.env.QA_NETWORK_HMAC_SECRET, vercel: () => process.env.VERCEL === "1", localIdentity: () => process.env.NODE_ENV === "development" ? process.env.QA_LOCAL_NETWORK_ID : undefined });
export const qaPrincipalResolver = createQaPrincipalResolver({ database: db, auth: authorizationDependencies, secure: process.env.NODE_ENV !== "development", abuse, networkId });
export const qaService = createQaService({ store: createQaConversationStore(db, { abuse: abuse.hooks, publicSourceIds }), retriever: createQaRetriever(db, { publicSourceIds, topK: 4, maxEvidenceTokens: 3000 }), generator: createQaGenerator() });
export const qaHttp = createQaHttpHandlers({ enabled: qaRuntimeEnabled, resolve: qaPrincipalResolver.resolve, ask: qaService.ask, history: qaService.history, delete: qaService.delete });
