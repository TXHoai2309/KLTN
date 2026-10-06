import type {
  PublicCultureDestination,
  PublicCultureSource,
} from "@/modules/culture/culture.types";

import CultureSources from "./culture-sources";
import RelatedDestinations from "./related-destinations";

export default function CultureDetailSlots({
  sources,
  destinations,
}: {
  sources: readonly PublicCultureSource[];
  destinations: readonly PublicCultureDestination[];
}) {
  return (
    <div
      className="culture-detail-slots"
      aria-label="Các khu vực mở rộng của nội dung văn hóa"
    >
      <CultureSources sources={sources} />
      <RelatedDestinations destinations={destinations} />
      <section
        aria-label="Khu vực Yêu thích"
        data-culture-slot="favorite"
      />
    </div>
  );
}
