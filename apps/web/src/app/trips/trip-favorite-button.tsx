"use client";

import { useRouter } from "next/navigation";
import FavoriteButton from "@/components/favorite-button";

export default function TripFavoriteButton({ tripId, isFavorite }: { tripId: string; isFavorite: boolean }) {
  const router = useRouter();
  return <FavoriteButton targetType="trips" targetId={tripId} initialIsFavorite={isFavorite} onConfirmed={() => router.refresh()} />;
}
