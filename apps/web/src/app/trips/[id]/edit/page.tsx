import { renderSavedTripAssistantPage } from "./saved-trip-assistant-page";

export default async function EditTripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return renderSavedTripAssistantPage(id, "edit");
}
