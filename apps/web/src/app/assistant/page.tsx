import type { Metadata } from "next";
import { AssistantChat, AssistantShell } from "../../components/assistant/assistant-chat";
import "../../components/assistant/assistant.css";

export const metadata: Metadata = { title: "Trợ lý AI | Hà Giang Travel Assistant" };

export default async function AssistantPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const contextProps = searchParams ? await (await import("./assistant-context-page")).loadAssistantContext(await searchParams) : {};
  const contextKey = contextProps.initialContext?.type === "DESTINATION" ? contextProps.initialContext.destinationId : contextProps.contextError ? "invalid" : "GENERAL";
  // Literal build-time gate: production must never import the fake transport.
  if (process.env.NODE_ENV === "development") {
    if (process.env.QA_RUNTIME_ENABLED === "true") {
      const { AssistantRuntimeChat } = await import("../../components/assistant/assistant-runtime-chat");
      return <AssistantShell><AssistantRuntimeChat key={contextKey} {...contextProps} /></AssistantShell>;
    }
    const { AssistantDevelopmentChat } = await import("../../../development/assistant-development-chat");
    if (contextProps.initialContext?.type === "DESTINATION" || contextProps.contextError) return <AssistantShell><AssistantChat {...contextProps} /></AssistantShell>;
    return <AssistantShell><AssistantDevelopmentChat /></AssistantShell>;
  }
  // The future real HTTP adapter belongs here, not in the demo module.
  return <AssistantShell><AssistantChat key={contextKey} {...contextProps} /></AssistantShell>;
}
