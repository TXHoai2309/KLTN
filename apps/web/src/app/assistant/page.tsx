import type { Metadata } from "next";
import { AssistantShell } from "../../components/assistant/assistant-answer";
import { AssistantV2Pending } from "../../components/assistant/assistant-v2-pending";
import { isConfiguredQaRuntimeEnabled } from "../../modules/ai/qa-runtime-gate";
import { applicationSettings, qaSettings } from "../../modules/runtime-config/runtime-config-service";
import "../../components/assistant/assistant.css";

export const metadata: Metadata = { title: "Trợ lý AI | Hà Giang Travel Assistant" };
export const dynamic = "force-dynamic";

export default async function AssistantPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const contextProps = searchParams ? await (await import("./assistant-context-page")).loadAssistantContext(await searchParams) : {};
  const mustIncludeKey = contextProps.mustIncludeDestinations?.map(d => d.id).join(",") ?? "";
  const intentKey = contextProps.initialPlanIntent ? "plan" : "qa";
  const baseKey = contextProps.initialContext?.type === "DESTINATION" ? contextProps.initialContext.destinationId : contextProps.contextError ? "invalid" : "GENERAL";
  const contextKey = `${baseKey}:${intentKey}:${mustIncludeKey}`;
  // Use the same server-side gate as the AI API. A closed environment stays visibly
  // unavailable; there is no other chat to fall back to.
  if (await qaSettings().then(isConfiguredQaRuntimeEnabled, () => false)) {
    const settings = await applicationSettings().catch(() => null);
    const { AssistantRuntimeChat } = await import("../../components/assistant/assistant-runtime-chat");
    return <AssistantShell><AssistantRuntimeChat key={contextKey} {...contextProps} tripsageChatEnabled={settings?.chatEnabled ?? false} memoryEnabled={settings?.memory ?? false} /></AssistantShell>;
  }

  return <AssistantShell><AssistantV2Pending unavailable /></AssistantShell>;
}
