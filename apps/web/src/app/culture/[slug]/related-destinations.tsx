import Link from "next/link";
import type { Route } from "next";

import type { PublicCultureDestination } from "@/modules/culture/culture.types";

function destinationDetailHref(id: string): Route {
  return `/destinations/${encodeURIComponent(id)}` as Route;
}

export default function RelatedDestinations({
  destinations,
}: {
  destinations: readonly PublicCultureDestination[];
}) {
  if (destinations.length === 0) return null;

  return (
    <section
      className="culture-detail-section culture-related-destinations"
      aria-labelledby="culture-related-destinations-title"
      data-culture-slot="related-destinations"
    >
      <h2 id="culture-related-destinations-title">Điểm đến liên quan</h2>
      <ul className="culture-related-destination-list">
        {destinations.map((destination) => (
          <li key={destination.id}>
            <Link
              className="culture-related-destination-link"
              href={destinationDetailHref(destination.id)}
            >
              {destination.name}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
