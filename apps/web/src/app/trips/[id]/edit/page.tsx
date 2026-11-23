import type { Metadata } from "next";
import { renderSavedTripAssistantPage } from "./saved-trip-assistant-page";

export const metadata: Metadata = {
  title: "Chỉnh sửa chuyến đi | Hà Giang Travel Assistant",
};

export default async function EditTripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return renderSavedTripAssistantPage(id, "edit");
}
