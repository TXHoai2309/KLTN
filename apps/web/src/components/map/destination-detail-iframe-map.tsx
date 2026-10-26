type Destination = {
  name: string;
  area?: string;
  latitude: number | null;
  longitude: number | null;
  profile?: {
    address?: string | null;
    googleMapsUrl?: string | null;
    locationVerified?: boolean;
  };
};

function verifiedGooglePlaceUrl(profile: Destination["profile"]): string | null {
  if (!profile?.locationVerified || !profile.googleMapsUrl) return null;
  try {
    const url = new URL(profile.googleMapsUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase();
    if (host === "maps.app.goo.gl" && url.pathname.length > 1) return url.href;
    if (host === "goo.gl" && url.pathname.startsWith("/maps/")) return url.href;
    if (!["google.com", "www.google.com", "maps.google.com", "google.com.vn", "www.google.com.vn", "maps.google.com.vn"].includes(host)) return null;
    if (!url.pathname.startsWith("/maps/")) return null;
    if (url.pathname.startsWith("/maps/place/") && url.pathname.length > "/maps/place/".length) return url.href;
    if (url.searchParams.has("query_place_id") || url.searchParams.has("place_id")) return url.href;
  } catch { return null; }
  return null;
}

export function destinationDetailCoordinates(destination: Pick<Destination, "latitude" | "longitude">): string | null {
  const { latitude, longitude } = destination;
  if (typeof latitude !== "number" || typeof longitude !== "number" || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return `${latitude},${longitude}`;
}

export function destinationDetailEmbedUrl(coordinates: string): string {
  return `https://maps.google.com/maps?q=${encodeURIComponent(coordinates)}&z=13&output=embed`;
}

export default function DestinationDetailIframeMap({ destination, label }: { destination: Destination; label?: string }) {
  const mapLabel = label ?? `Bản đồ vị trí ${destination.name}`;
  const coordinates = destinationDetailCoordinates(destination);

  if (!coordinates) return <section className="destination-map" aria-label={mapLabel}><div className="destination-map-state" role="status">Điểm đến chưa có tọa độ hợp lệ để hiển thị trên bản đồ.</div></section>;

  const verifiedPlaceUrl = verifiedGooglePlaceUrl(destination.profile);
  const searchQuery = [destination.name.trim(), destination.profile?.address?.trim() || destination.area?.trim() || "Hà Giang", "Việt Nam"].filter(Boolean).join(", ");
  const locationUrl = verifiedPlaceUrl ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(searchQuery)}`;
  return <section className="destination-map destination-detail-iframe-map" aria-label={mapLabel}>
    <iframe
      className="destination-map-canvas"
      title={mapLabel}
      src={destinationDetailEmbedUrl(coordinates)}
      width="100%"
      height="440"
      style={{ border: 0 }}
      allowFullScreen
      loading="lazy"
      referrerPolicy="strict-origin-when-cross-origin"
    />
    <a className="destination-detail-map-link" href={locationUrl} target="_blank" rel="noopener noreferrer">{verifiedPlaceUrl ? "Mở địa danh trên Google Maps" : "Tìm điểm đến trên Google Maps"}</a>
  </section>;
}
