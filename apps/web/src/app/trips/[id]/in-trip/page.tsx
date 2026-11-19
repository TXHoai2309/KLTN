import { renderSavedTripAssistantPage } from "../edit/saved-trip-assistant-page";

export default async function InTripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return renderSavedTripAssistantPage(id, "in-trip");
}
