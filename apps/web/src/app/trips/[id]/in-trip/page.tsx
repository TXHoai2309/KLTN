import type { Metadata } from "next";
import { renderSavedTripAssistantPage } from "../edit/saved-trip-assistant-page";

export const metadata: Metadata = {
  title: "Theo dõi chuyến đi | Hà Giang Travel Assistant",
};

export default async function InTripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return renderSavedTripAssistantPage(id, "in-trip");
}
