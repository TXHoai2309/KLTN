"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";

interface HomeHeroVideoProps {
  src: string;
  poster?: string;
}

export default function HomeHeroVideo({
  src,
  poster = "/images/ha-giang-highland-poster.webp",
}: HomeHeroVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(true);

  const toggleSound = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.muted) {
      video.muted = false;
      video.volume = 0.75;
      video.play().catch(() => {
        // Autoplay policy fallback
      });
      setIsMuted(false);
    } else {
      video.muted = true;
      setIsMuted(true);
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleVolumeChange = () => {
      setIsMuted(video.muted);
    };

    video.addEventListener("volumechange", handleVolumeChange);
    return () => {
      video.removeEventListener("volumechange", handleVolumeChange);
    };
  }, []);

  // IntersectionObserver: Tự động tạm dừng video flycam khi cuộn ra khỏi viewport để tiết kiệm GPU/pin
  useEffect(() => {
    const video = videoRef.current;
    if (!video || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (entry.isIntersecting) {
          video.play().catch(() => {
            // Xử lý an toàn nếu trình duyệt chặn autoplay
          });
        } else {
          video.pause();
        }
      },
      { threshold: 0.05 }
    );

    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="home-hero-visual" aria-hidden="false">
      <video
        ref={videoRef}
        className="home-hero-video"
        src={src}
        poster={poster}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
      />

      <div className="home-scene-controls">
        <button
          type="button"
          onClick={toggleSound}
          className={`home-sound-toggle ${isMuted ? "is-muted" : "is-active"}`}
          aria-label={isMuted ? "Bật âm thanh video flycam" : "Tắt âm thanh video flycam"}
          title={isMuted ? "Bật âm thanh video" : "Tắt âm thanh video"}
        >
          {isMuted ? (
            <>
              <span className="home-sound-dot" aria-hidden="true" />
              <VolumeX size={15} aria-hidden="true" />
              <span className="home-sound-toggle-text">Bật âm thanh</span>
              <span className="home-sound-pulse-ring" aria-hidden="true" />
            </>
          ) : (
            <>
              <span className="home-sound-wave" aria-hidden="true">
                <span className="wave-bar bar-1" />
                <span className="wave-bar bar-2" />
                <span className="wave-bar bar-3" />
              </span>
              <Volume2 size={15} aria-hidden="true" />
              <span className="home-sound-toggle-text">Tắt âm</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
