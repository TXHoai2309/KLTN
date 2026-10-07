import React from "react";
import Link from "next/link";
import { Card, CardContent } from "@KLTN/ui/components/card";
import type { PublicLocation } from "@/modules/destination/public-destination-query";
import type { ExploreReturnHref } from "@/modules/destination/destination-detail-navigation";
import { destinationDetailHref } from "@/modules/map/map-model";

export default function DestinationCard({ destination, returnTo }: { destination: PublicLocation; returnTo?: ExploreReturnHref }) {
  return <Card className="destination-card"><Link className="destination-card-link" href={destinationDetailHref(destination.id, returnTo)}>
    {/* PublicLocation has no media field. Use the neutral component slot, not an unrelated sample photo. */}
    <div className="destination-card-media"><span>Chưa có ảnh</span></div>
    <CardContent className="destination-card-content"><p className="destination-card-meta">{destination.area} · {destination.category}</p><h3>{destination.name}</h3><span className="destination-card-action">Xem chi tiết <span aria-hidden="true">→</span></span></CardContent>
  </Link></Card>;
}
