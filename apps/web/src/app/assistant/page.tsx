import type { Metadata } from "next";
import { AssistantShell } from "../../components/assistant/assistant-answer";
import { AssistantV2Pending } from "../../components/assistant/assistant-v2-pending";
import { isQaRuntimeEnabled } from "../../modules/ai/qa-runtime-gate";
import { isTripsageChatEnabled } from "../../modules/tripsage-chat/tripsage-chat-flag";
import { enabledTripsageFeatures } from "../../modules/tripsage-chat/tripsage-features";
import "../../components/assistant/assistant.css";

export const metadata: Metadata = { title: "Trợ lý AI | Hà Giang Travel Assistant" };

export default async function AssistantPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const contextProps = searchParams ? await (await import("./assistant-context-page")).loadAssistantContext(await searchParams) : {};
  const contextKey = contextProps.initialContext?.type === "DESTINATION" ? contextProps.initialContext.destinationId : contextProps.contextError ? "invalid" : "GENERAL";
  // Single assistant entry (ADR-43 §1): TRIPSAGE_CHAT_ENABLED routes signed-in travelers to the unified agent chat
  // while guests remain on Q&A-only and flag-off falls back to the previous V2 chat without a code deploy.
  const tripsageChatEnabled = isTripsageChatEnabled();
  const memoryEnabled = enabledTripsageFeatures().has("memory");
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
    return <AssistantShell><AssistantRuntimeChat key={contextKey} {...contextProps} tripsageChatEnabled={tripsageChatEnabled} memoryEnabled={memoryEnabled} /></AssistantShell>;
  }

  return <AssistantShell><AssistantV2Pending unavailable /></AssistantShell>;
}
