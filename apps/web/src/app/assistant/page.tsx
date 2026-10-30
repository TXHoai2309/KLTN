import type { Metadata } from "next";
import { AssistantShell } from "../../components/assistant/assistant-answer";
import { AssistantV2Pending } from "../../components/assistant/assistant-v2-pending";
import { isQaRuntimeEnabled } from "../../modules/ai/qa-runtime-gate";
import "../../components/assistant/assistant.css";

export const metadata: Metadata = { title: "Trợ lý AI | Hà Giang Travel Assistant" };

export default async function AssistantPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const contextProps = searchParams ? await (await import("./assistant-context-page")).loadAssistantContext(await searchParams) : {};
  const contextKey = contextProps.initialContext?.type === "DESTINATION" ? contextProps.initialContext.destinationId : contextProps.contextError ? "invalid" : "GENERAL";
  // Use the same server-side gate as the AI API. A closed environment stays visibly
  // unavailable; there is no other chat to fall back to.
  if (((process.env.NODE_ENV === "development" && (!process.env.VERCEL_ENV || process.env.VERCEL_ENV === "development")) ||
    (process.env.NODE_ENV === "production" && process.env.VERCEL_ENV === "preview") ||
    (process.env.NODE_ENV === "production" && process.env.VERCEL_ENV === "production" && process.env.QA_PRODUCTION_RUNTIME_ENABLED === "true")) && isQaRuntimeEnabled({
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
    qaRuntimeEnabled: process.env.QA_RUNTIME_ENABLED,
    qaPreviewRuntimeEnabled: process.env.QA_PREVIEW_RUNTIME_ENABLED,
    qaProductionRuntimeEnabled: process.env.QA_PRODUCTION_RUNTIME_ENABLED,
    qaAbuseProtectionAccepted: process.env.QA_ABUSE_PROTECTION_ACCEPTED,
    databaseUrl: process.env.DATABASE_URL,
    allowedDatabaseHost: process.env.QA_RUNTIME_ALLOWED_DATABASE_HOST,
    allowedDatabaseName: process.env.QA_RUNTIME_ALLOWED_DATABASE_NAME,
  })) {
    const { AssistantRuntimeChat } = await import("../../components/assistant/assistant-runtime-chat");
    return <AssistantShell><AssistantRuntimeChat key={contextKey} {...contextProps} /></AssistantShell>;
  }

  return <AssistantShell><AssistantV2Pending unavailable /></AssistantShell>;
}
