import type { Metadata } from "next";
import { AssistantChat, AssistantShell } from "../../components/assistant/assistant-chat";
import { isQaRuntimeEnabled } from "../../modules/ai/qa-runtime-gate";
import "../../components/assistant/assistant.css";

export const metadata: Metadata = { title: "Trợ lý AI | Hà Giang Travel Assistant" };

export default async function AssistantPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const contextProps = searchParams ? await (await import("./assistant-context-page")).loadAssistantContext(await searchParams) : {};
  const contextKey = contextProps.initialContext?.type === "DESTINATION" ? contextProps.initialContext.destinationId : contextProps.contextError ? "invalid" : "GENERAL";
  // Use the same server-side gate as the AI API. A closed Preview or Production stays visibly
  // unavailable; it never falls back to the local demo transport.
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

  // Keep the fixture transport local-only. Preview and Production render the
  // existing unavailable state whenever the shared server gate is closed.
  if (process.env.NODE_ENV === "development" && (!process.env.VERCEL_ENV || process.env.VERCEL_ENV === "development")) {
    const { AssistantDevelopmentChat } = await import("../../../development/assistant-development-chat");
    if (contextProps.initialContext?.type === "DESTINATION" || contextProps.contextError) return <AssistantShell><AssistantChat {...contextProps} /></AssistantShell>;
    return <AssistantShell><AssistantDevelopmentChat /></AssistantShell>;
  }

  return <AssistantShell><AssistantChat key={contextKey} {...contextProps} /></AssistantShell>;
}
