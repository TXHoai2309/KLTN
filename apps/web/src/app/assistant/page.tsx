import type { Metadata } from "next";
import { AssistantShell } from "../../components/assistant/assistant-answer";
import { AssistantV2Pending } from "../../components/assistant/assistant-v2-pending";
import { AssistantModeTabs } from "../../components/tripsage-chat/assistant-mode-tabs";
import { isConfiguredQaRuntimeEnabled } from "../../modules/ai/qa-runtime-gate";
import { applicationSettings, qaSettings } from "../../modules/runtime-config/runtime-config-service";
import "../../components/assistant/assistant.css";

export const metadata: Metadata = { title: "Trợ lý AI | Hà Giang Travel Assistant" };
export const dynamic = "force-dynamic";

export default async function AssistantPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  // One address, two modes: `/assistant?mode=plan` is rewritten to the planning chat page (next.config.ts).
  // The switch is only shown while the planning flag is on; with the flag off nothing here changes.
  const showPlanning = await applicationSettings().then(settings => settings.chatEnabled, () => false);
  const tabs = showPlanning ? <AssistantModeTabs active="chat" /> : null;
  const contextProps = searchParams ? await (await import("./assistant-context-page")).loadAssistantContext(await searchParams) : {};
  const contextKey = contextProps.initialContext?.type === "DESTINATION" ? contextProps.initialContext.destinationId : contextProps.contextError ? "invalid" : "GENERAL";
  // Use the same server-side gate as the AI API. A closed environment stays visibly
  // unavailable; there is no other chat to fall back to.
  if (await qaSettings().then(isConfiguredQaRuntimeEnabled, () => false)) {
    const { AssistantRuntimeChat } = await import("../../components/assistant/assistant-runtime-chat");
    return tabs
      ? <AssistantShell>{tabs}<AssistantRuntimeChat key={contextKey} {...contextProps} /></AssistantShell>
      : <AssistantShell><AssistantRuntimeChat key={contextKey} {...contextProps} /></AssistantShell>;
  }

  return tabs ? <AssistantShell>{tabs}<AssistantV2Pending unavailable /></AssistantShell> : <AssistantShell><AssistantV2Pending unavailable /></AssistantShell>;
}
