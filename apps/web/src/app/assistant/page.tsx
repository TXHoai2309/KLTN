import type { Metadata } from "next";
import { AssistantChat, AssistantShell } from "../../components/assistant/assistant-chat";
import "../../components/assistant/assistant.css";

export const metadata: Metadata = { title: "Trợ lý AI | Hà Giang Travel Assistant" };

export default async function AssistantPage() {
  // Literal build-time gate: production must never import the fake transport.
  if (process.env.NODE_ENV === "development") {
    const { AssistantDevelopmentChat } = await import("../../../development/assistant-development-chat");
    return <AssistantShell><AssistantDevelopmentChat /></AssistantShell>;
  }
  // The future real HTTP adapter belongs here, not in the demo module.
  return <AssistantShell><AssistantChat /></AssistantShell>;
}
