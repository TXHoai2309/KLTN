import { createQaAssessor } from "./qa-assessment";
import { createQaQuestionUnderstander } from "./qa-question-understander";
import "server-only";
import { db } from "../../services";
import { authorizationDependencies } from "../../server/authorization/server";
import { createQaPrincipalResolver } from "./qa-principal";
import { createQaConversationStore } from "./qa-conversation-store";
import { createQaRetriever } from "./qa-retrieval";
import { createQaGenerator } from "./qa-generation";
import { createQaService } from "./qa-service";
import { createQaHttpHandlers, qaHttpError } from "./qa-http";
import { createQaAbuseGuard, createQaNetworkResolver } from "./qa-abuse";
import { isConfiguredQaRuntimeEnabled } from "./qa-runtime-gate";
import { createQaDiagnostics } from "./qa-diagnostics";
import { resolveQaContext } from "./qa-destination-context";
import { createDefaultQaWeatherDependencies } from "./qa-weather-answer";
import { qaSettings } from "../runtime-config/runtime-config-service";
const abuse = createQaAbuseGuard(db);
export async function qaRuntimeForRequest() {
  const settings = await qaSettings();
  const legacySourceIds = settings.legacySourceFilter
    ? new Set(settings.publicSourceIds.split(",").map(value => value.trim()).filter(Boolean))
    : undefined;
  const networkId = createQaNetworkResolver({ secret: () => process.env.QA_NETWORK_HMAC_SECRET, vercel: () => process.env.VERCEL === "1", localIdentity: () => process.env.NODE_ENV === "development" ? settings.localNetworkId || undefined : undefined });
  const principal = createQaPrincipalResolver({ database: db, auth: authorizationDependencies, secure: process.env.NODE_ENV !== "development", abuse, networkId });
  const service = createQaService({
    store: createQaConversationStore(db, { abuse: abuse.hooks, publicSourceIds: legacySourceIds, maxPerTenMinutes: 100_000_000, maxPerDay: 100_000_000 }),
    retriever: createQaRetriever(db, { publicSourceIds: legacySourceIds, topK: 4, maxEvidenceTokens: 3000, hybrid: true }),
    generator: createQaGenerator(),
    assessor: createQaAssessor(),
    understander: createQaQuestionUnderstander(),
    weather: createDefaultQaWeatherDependencies(db),
    resolveContext: context => resolveQaContext(db, context),
  });
  return { enabled: isConfiguredQaRuntimeEnabled(settings), principal, service };
}

const diagnostics = createQaDiagnostics({ nodeEnv: process.env.NODE_ENV, vercelEnv: process.env.VERCEL_ENV });
export async function withQaHttp(handle: (handlers: ReturnType<typeof createQaHttpHandlers>) => Promise<Response>) {
  try {
    const { enabled, principal, service } = await qaRuntimeForRequest();
    return await handle(createQaHttpHandlers({ diagnostics, enabled: () => enabled, resolve: principal.resolve, ...service }));
  } catch (error) {
    return qaHttpError(error);
  }
}
