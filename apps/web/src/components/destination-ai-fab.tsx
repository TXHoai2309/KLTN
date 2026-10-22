"use client";

import { useAssistantDestination } from "./assistant/global-assistant";

export interface DestinationAiFabProps {
  destinationId: string;
  destinationName?: string;
  className?: string;
}

/** Both Destination render paths register context with the single layout launcher. */
export function DestinationAiFab({ destinationId, destinationName }: DestinationAiFabProps) {
  useAssistantDestination({ id: destinationId, name: destinationName });
  return null;
}

export default DestinationAiFab;
