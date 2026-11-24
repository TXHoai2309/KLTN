import React from "react";
import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";
import { Card, CardContent } from "@KLTN/ui/components/card";
import type { PublicLocation } from "@/modules/destination/public-destination-query";
import type { ExploreReturnHref } from "@/modules/destination/destination-detail-navigation";
import { destinationDetailHref } from "@/modules/map/map-model";
import DestinationCardImage from "@/components/destination-card-image";
import FavoriteButton from "@/components/favorite-button";
import { cleanCategoryDisplayLabel, cleanPlaceDisplayName } from "@/lib/traveler-display-clean";
import { resolveExploreDisplayArea } from "@/modules/destination/explore-filter-sort";

export default function DestinationCard({
  destination,
  returnTo,
  distanceKm,
}: {
  destination: PublicLocation;
  returnTo?: ExploreReturnHref;
  distanceKm?: number | null;
}) {
  const displayName = cleanPlaceDisplayName(destination.name) || destination.name;
  const displayArea = resolveExploreDisplayArea(destination);
  const displayCategory = cleanCategoryDisplayLabel(destination.category) || destination.category;
  const distanceLabel = typeof distanceKm === "number" && Number.isFinite(distanceKm)
    ? distanceKm < 1
      ? `${Math.round(distanceKm * 1000)} m`
      : `${distanceKm.toFixed(1)} km`
    : null;

  return (
    <Card className="destination-card">
      <Link className="destination-card-link" href={destinationDetailHref(destination.id, returnTo)}>
        <div className="destination-card-media">
          <DestinationCardImage image={destination.image} />
          {displayArea && (
            <span className="destination-card-area">
              <MapPin size={12} aria-hidden="true" />
              <span>{displayArea}</span>
            </span>
          )}
        </div>
        <CardContent className="destination-card-content">
          <div className="destination-card-meta-wrap">
            <span className="destination-card-meta">{displayCategory}</span>
            {distanceLabel && <span className="destination-card-distance">{distanceLabel}</span>}
          </div>
          <h3 title={displayName}>{displayName}</h3>
          <span className="destination-card-action">
            <span>Xem chi tiết</span>
            <ArrowRight size={14} aria-hidden="true" />
          </span>
        </CardContent>
      </Link>
      <div
        className="destination-card-favorite"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <FavoriteButton targetType="destinations" targetId={destination.id} />
      </div>
    </Card>
  );
}
