"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { Route } from "next";
import type { PublicLocation } from "@/modules/destination/public-destination-list";
import { destinationDetailHref } from "@/modules/map/map-model";
import { destinationThumbnail } from "@/modules/destination/destination-image-url";
import { ArrowRight, Compass, MapPin, X } from "lucide-react";

const mapLocation = "Hà Giang, Việt Nam";
const directionsDestination = "Thành phố Hà Giang, Việt Nam";
const mapEmbedUrl = `https://maps.google.com/maps?q=${encodeURIComponent(mapLocation)}&ll=22.8233,104.9836&z=9&output=embed`;
const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(directionsDestination)}`;

function MapSkeleton({ count }: { count?: number }) {
  return (
    <div className="home-explore-map-skeleton" aria-hidden="true">
      <div className="home-explore-map-skeleton-inner">
        <div className="home-explore-map-skeleton-icon">
          <Compass className="home-skeleton-spinner" size={32} />
        </div>
        <p className="home-explore-map-skeleton-title">Đang tải bản đồ Hà Giang…</p>
        <p className="home-explore-map-skeleton-desc">
          Chuẩn bị hiển thị {count ? `${count} điểm đến` : "các địa danh"} trên cao nguyên đá
        </p>
      </div>
    </div>
  );
}

export function HomeExploreMapLoading() {
  return (
    <div className="home-explore-map-card" role="status" aria-busy="true" aria-label="Đang tải dữ liệu điểm đến Hà Giang">
      <div className="home-explore-map-visual"><MapSkeleton /></div>
      <div className="home-destination-list-panel home-destination-list-loading" aria-hidden="true">
        <span /><span /><span /><span />
      </div>
    </div>
  );
}

export default function HomeExploreMap({
  destinations,
  descriptions = {},
}: {
  destinations: readonly PublicLocation[];
  descriptions?: Record<string, string>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedButtonRef = useRef<HTMLButtonElement>(null);
  const previewRef = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedDestination = destinations.find((destination) => destination.id === selectedId);

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

  useEffect(() => {
    if (!selectedDestination) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        selectedButtonRef.current?.focus();
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedDestination]);

  useEffect(() => {
    if (selectedId) previewRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  return (
    <div
      ref={containerRef}
      className={`home-explore-map-card${selectedDestination ? " has-active-preview" : ""}`}
      role="region"
      aria-label="Bản đồ và danh sách điểm đến Hà Giang"
    >
      <div className="home-explore-map-visual">
        <div className="home-map-status-badge" role="status" aria-live="polite">
          <span className="home-map-status-pulse" aria-hidden="true" />
          <span className="home-map-status-title">Khám phá Hà Giang</span>
          <span className="home-map-status-sep" aria-hidden="true">·</span>
          <span className="home-map-status-count">
            <MapPin size={12} className="home-map-status-icon" aria-hidden="true" />
            {destinations.length} điểm đến
          </span>
        </div>
        {inView ? (
          <iframe
            className="home-google-map-frame"
            title="Bản đồ khu vực Hà Giang"
            src={mapEmbedUrl}
            width="100%"
            height="520"
            style={{ border: 0 }}
            allowFullScreen
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <MapSkeleton count={destinations.length} />
        )}
      </div>

      <aside className="home-destination-list-panel" aria-label="Danh sách điểm đến Hà Giang">
        <div className="home-destination-list-heading">
          <strong>Điểm đến nổi bật</strong>
          <p>Chọn một địa điểm để xem nhanh thông tin.</p>
        </div>
        <ul className="home-destination-list">
          {destinations.map((destination, index) => {
            const isSelected = selectedId === destination.id;
            const previewId = `home-destination-preview-${index}`;
            return (
              <li key={destination.id} className="home-destination-list-item">
                <button
                  ref={isSelected ? selectedButtonRef : undefined}
                  type="button"
                  className={`home-destination-list-button${isSelected ? " is-selected" : ""}`}
                  onClick={() => setSelectedId(isSelected ? null : destination.id)}
                  aria-expanded={isSelected}
                  aria-controls={isSelected ? previewId : undefined}
                >
                  <span className="home-destination-list-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                  <span className="home-destination-list-copy">
                    <strong>{destination.name}</strong>
                    <small>{destination.area} · {destination.category}</small>
                  </span>
                  <ArrowRight size={15} aria-hidden="true" />
                </button>
                {isSelected && (
                  <article
                    ref={previewRef}
                    id={previewId}
                    className="home-map-preview-card"
                    role="region"
                    aria-label={`Thông tin địa điểm ${destination.name}`}
                  >
                    <button
                      type="button"
                      className="home-map-preview-close"
                      onClick={() => {
                        selectedButtonRef.current?.focus();
                        setSelectedId(null);
                      }}
                      aria-label="Đóng bảng xem trước (phím Esc)"
                    >
                      <X size={15} aria-hidden="true" />
                    </button>

                    <div className="home-map-preview-inner">
                      {destination.image?.url && (
                        <div className="home-map-preview-media">
                          <Image
                            src={destinationThumbnail(destination.image.url)}
                            alt={destination.image.alt || destination.name}
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
                            {destination.area}
                          </span>
                          <span className="home-map-preview-category">
                            {destination.category}
                          </span>
                        </div>

                        <h3 className="home-map-preview-title">{destination.name}</h3>

                        <p className="home-map-preview-desc">
                          {descriptions[destination.id] ||
                            `Khám phá điểm đến nổi bật thuộc ${destination.area} với nét đặc trưng ${destination.category} của cao nguyên đá Hà Giang.`}
                        </p>

                        <div className="home-map-preview-actions">
                          <Link
                            href={destinationDetailHref(destination.id) as Route}
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
              </li>
            );
          })}
        </ul>
        <a className="home-destination-directions" href={directionsUrl} target="_blank" rel="noopener noreferrer">
          <MapPin size={16} aria-hidden="true" />
          <span>Xem chỉ đường đến Hà Giang</span>
          <ArrowRight size={16} aria-hidden="true" />
        </a>
      </aside>
    </div>
  );
}
