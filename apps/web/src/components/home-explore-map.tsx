"use client";

import React, { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import Image from "next/image";
import type { Route } from "next";
import type { PublicLocation } from "@/modules/destination/public-destination-list";
import { projectMarkers, destinationDetailHref } from "@/modules/map/map-model";
import { destinationThumbnail } from "@/modules/destination/destination-image-url";
import { ArrowRight, Compass, MapPin, X } from "lucide-react";

function MapSkeleton({ validCount }: { validCount?: number }) {
  return (
    <div className="home-explore-map-skeleton" aria-hidden="true">
      <div className="home-explore-map-skeleton-inner">
        <div className="home-explore-map-skeleton-icon">
          <Compass className="home-skeleton-spinner" size={32} />
        </div>
        <p className="home-explore-map-skeleton-title">Đang kết nối dữ liệu bản đồ Hà Giang…</p>
        <p className="home-explore-map-skeleton-desc">
          Chuẩn bị hiển thị {validCount ? `${validCount} điểm đến` : "các địa danh"} trên cao nguyên đá
        </p>
      </div>
    </div>
  );
}

export function HomeExploreMapLoading() {
  return <div className="home-explore-map-card" role="status" aria-busy="true" aria-label="Đang tải dữ liệu điểm đến trên bản đồ">
    <MapSkeleton />
  </div>;
}

// Dynamically import DestinationMap with ssr: false for optimal client bundle lazy loading
const DestinationMap = dynamic(
  () => import("@/components/map/destination-map"),
  {
    ssr: false,
    loading: () => <MapSkeleton />,
  }
);

export default function HomeExploreMap({
  destinations,
  descriptions = {},
}: {
  destinations: readonly PublicLocation[];
  descriptions?: Record<string, string>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const validPoints = projectMarkers(destinations);

  const selectedDestination = destinations.find((d) => d.id === selectedId) ?? null;

  // Lazy loading observer
  useEffect(() => {
    if (inView) return;
    const node = containerRef.current;
    if (!node) return;

    if (!("IntersectionObserver" in window)) {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry && (entry.isIntersecting || entry.intersectionRatio > 0)) {
          setInView(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: "350px 0px",
        threshold: 0,
      }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [inView]);

  // Handle container resize to prevent marker drift
  useEffect(() => {
    if (!inView || typeof window === "undefined" || !("ResizeObserver" in window)) return;
    const node = containerRef.current;
    if (!node) return;

    let resizeTimer: NodeJS.Timeout;
    const resizeObserver = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        window.dispatchEvent(new Event("resize"));
      }, 100);
    });

    resizeObserver.observe(node);
    return () => {
      clearTimeout(resizeTimer);
      resizeObserver.disconnect();
    };
  }, [inView]);

  // Event delegation to catch clicks on MapLibre markers
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleClick = (e: MouseEvent) => {
      const marker = (e.target as HTMLElement).closest<HTMLElement>(".destination-map-marker");
      if (marker) {
        const id = marker.getAttribute("data-destination-id");
        if (id) {
          setSelectedId((prev) => (prev === id ? null : id));
        }
      }
    };

    container.addEventListener("click", handleClick);
    return () => container.removeEventListener("click", handleClick);
  }, []);

  // Keyboard accessibility: Escape key to close preview
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Sync selected state onto DOM marker elements for visual highlighting
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const markers = container.querySelectorAll<HTMLElement>(".destination-map-marker");
    markers.forEach((m) => {
      const id = m.getAttribute("data-destination-id");
      if (id === selectedId) {
        m.classList.add("is-selected");
        m.setAttribute("aria-expanded", "true");
      } else {
        m.classList.remove("is-selected");
        m.setAttribute("aria-expanded", "false");
      }
    });
  }, [selectedId, inView]);

  return (
    <div
      ref={containerRef}
      className={`home-explore-map-card${selectedDestination ? " has-active-preview" : ""}`}
      role="region"
      aria-label="Bản đồ các điểm đến Hà Giang"
    >
      {/* Top Floating Badge - Corner indicator */}
      <div className="home-map-status-badge" role="status" aria-live="polite">
        <span className="home-map-status-pulse" aria-hidden="true" />
        <span className="home-map-status-title">Khám phá Hà Giang</span>
        <span className="home-map-status-sep" aria-hidden="true">·</span>
        <span className="home-map-status-count">
          <MapPin size={12} className="home-map-status-icon" aria-hidden="true" />
          {validPoints.length} điểm đến
        </span>
      </div>

      {inView ? (
        <DestinationMap
          destinations={destinations}
          label="Bản đồ các điểm đến tiêu biểu tại Hà Giang"
          disableDefaultPopup
        />
      ) : (
        <MapSkeleton validCount={validPoints.length} />
      )}

      {/* Interactive Floating Preview Card (Desktop bottom-left, Mobile bottom-sheet) */}
      {selectedDestination && (
        <article
          className="home-map-preview-card"
          role="dialog"
          aria-label={`Thông tin địa điểm ${selectedDestination.name}`}
        >
          <button
            type="button"
            className="home-map-preview-close"
            onClick={() => setSelectedId(null)}
            aria-label="Đóng bảng xem trước (phím Esc)"
          >
            <X size={15} aria-hidden="true" />
          </button>

          <div className="home-map-preview-inner">
            {selectedDestination.image?.url && (
              <div className="home-map-preview-media">
                <Image
                  src={destinationThumbnail(selectedDestination.image.url)}
                  alt={selectedDestination.image.alt || selectedDestination.name}
                  width={140}
                  height={96}
                  className="home-map-preview-img"
                />
              </div>
            )}

            <div className="home-map-preview-body">
              <div className="home-map-preview-meta">
                <span className="home-map-preview-area">
                  <MapPin size={11} aria-hidden="true" />
                  {selectedDestination.area}
                </span>
                <span className="home-map-preview-category">
                  {selectedDestination.category}
                </span>
              </div>

              <h3 className="home-map-preview-title">{selectedDestination.name}</h3>

              <p className="home-map-preview-desc">
                {descriptions[selectedDestination.id] ||
                  `Khám phá điểm đến nổi bật thuộc ${selectedDestination.area} với nét đặc trưng ${selectedDestination.category} của cao nguyên đá Hà Giang.`}
              </p>

              <div className="home-map-preview-actions">
                <Link
                  href={destinationDetailHref(selectedDestination.id) as Route}
                  className="home-map-preview-btn"
                >
                  <Compass size={14} aria-hidden="true" />
                  <span>Xem chi tiết</span>
                  <ArrowRight size={13} aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>
        </article>
      )}
    </div>
  );
}
