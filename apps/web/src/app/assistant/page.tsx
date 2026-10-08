import type { Metadata } from "next";
import { AssistantChat, AssistantShell } from "../../components/assistant/assistant-chat";
import "../../components/assistant/assistant.css";

export const metadata: Metadata = { title: "Trợ lý AI | Hà Giang Travel Assistant" };

export default function AssistantPage() {
  // No transport is supplied until the real, authorized runtime is integrated.
  return <AssistantShell><AssistantChat /></AssistantShell>;
}
