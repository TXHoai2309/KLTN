"use client";

import { useEffect, useRef, useState } from "react";

interface MetricCounterProps {
  end: number;
  duration?: number;
  padStart?: number;
  suffix?: string;
  unit: string;
  label: string;
}

function MetricCounter({
  end,
  duration = 1800,
  padStart = 0,
  suffix = "",
  unit,
  label,
}: MetricCounterProps) {
  const [mounted, setMounted] = useState(false);
  const [displayValue, setDisplayValue] = useState(end);
  const [isLanded, setIsLanded] = useState(false);
  const elementRef = useRef<HTMLDivElement>(null);
  const animatedRef = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    // If user prefers reduced motion, keep final value
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplayValue(end);
      setIsLanded(true);
      return;
    }

    let animationFrameId: number;
    let startTime: number | null = null;

    const startCounting = () => {
      // Start from 0
      setDisplayValue(0);
      setIsLanded(false);

      const step = (timestamp: number) => {
        if (!startTime) startTime = timestamp;
        const elapsed = timestamp - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Ease-out cubic for smooth deceleration: 1 - (1 - p)^3
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const current = Math.round(easeOut * end);

        setDisplayValue(current);

        if (progress < 1) {
          animationFrameId = requestAnimationFrame(step);
        } else {
          setDisplayValue(end);
          setIsLanded(true);
        }
      };

      animationFrameId = requestAnimationFrame(step);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !animatedRef.current) {
          animatedRef.current = true;
          startCounting();
        }
      },
      { threshold: 0.15 }
    );

    if (elementRef.current) {
      observer.observe(elementRef.current);
    }

    return () => {
      observer.disconnect();
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [mounted, end, duration]);

  const formattedNumber = padStart
    ? String(displayValue).padStart(padStart, "0")
    : String(displayValue);

  return (
    <div
      ref={elementRef}
      className={`home-hero-metric-item ${isLanded ? "is-landed" : "is-counting"}`}
    >
      <strong className="home-hero-metric-strong">
        <span className="home-metric-number">{formattedNumber}</span>
        {suffix && <span className="home-metric-suffix">{suffix}</span>}
        <span className="home-metric-unit"> {unit}</span>
      </strong>
      <span className="home-hero-metric-label">{label}</span>
    </div>
  );
}

export default function HomeHeroMetrics() {
  return (
    <div
      className="home-hero-metrics home-hero-enter home-delay-4"
      aria-label="Thông số di sản cao nguyên đá"
    >
      <MetricCounter
        end={4}
        padStart={2}
        unit="huyện"
        label="Công viên địa chất UNESCO"
        duration={1400}
      />
      <div className="home-hero-metric-divider" aria-hidden="true" />
      <MetricCounter
        end={550}
        suffix="+"
        unit="triệu năm"
        label="Lịch sử kiến tạo Trái Đất"
        duration={2000}
      />
      <div className="home-hero-metric-divider" aria-hidden="true" />
      <MetricCounter
        end={17}
        unit="dân tộc"
        label="Bản sắc văn hóa đặc sắc"
        duration={1600}
      />
    </div>
  );
}
