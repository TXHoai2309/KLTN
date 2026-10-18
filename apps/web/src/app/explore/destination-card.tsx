import React from "react";
import Link from "next/link";
import { Card, CardContent } from "@KLTN/ui/components/card";
import type { PublicLocation } from "@/modules/destination/public-destination-query";
import type { ExploreReturnHref } from "@/modules/destination/destination-detail-navigation";
import { destinationDetailHref } from "@/modules/map/map-model";
import DestinationCardImage from "@/components/destination-card-image";
import FavoriteButton from "@/components/favorite-button";

export default function DestinationCard({ destination, returnTo }: { destination: PublicLocation; returnTo?: ExploreReturnHref }) {
  return (
    <Card className="destination-card">
      <Link className="destination-card-link" href={destinationDetailHref(destination.id, returnTo)}>
        <div className="destination-card-media">
          <DestinationCardImage image={destination.image} />
          <span className="destination-card-area">{destination.area}</span>
        </div>
        <CardContent className="destination-card-content">
          <p className="destination-card-meta">{destination.category}</p>
          <h3>{destination.name}</h3>
          <span className="destination-card-action">Xem chi tiết <span aria-hidden="true">→</span></span>
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
