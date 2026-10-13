import type { SVGProps } from "react";
import { useId } from "react";

export interface BrandLogoProps extends SVGProps<SVGSVGElement> {
  size?: number;
  className?: string;
}

/**
 * Bespoke brand emblem for Hà Giang Travel Assistant:
 * - Layered limestone mountain peaks (Cao nguyên đá Đồng Văn & Đèo Mã Pí Lèng)
 * - Meandering turquoise canyon river (Sông Nho Quế)
 * - Golden Northern guide star & AI sparkle (Cột cờ Lũng Cú & Trợ lý thông minh)
 */
export function BrandLogo({ size = 38, className = "", ...props }: BrandLogoProps) {
  const uniqueId = useId().replace(/:/g, "");

  const bgId = `hg-bg-${uniqueId}`;
  const peakBackId = `hg-peak-back-${uniqueId}`;
  const peakFrontLId = `hg-peak-front-l-${uniqueId}`;
  const peakFrontRId = `hg-peak-front-r-${uniqueId}`;
  const riverId = `hg-river-${uniqueId}`;
  const starId = `hg-star-${uniqueId}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 44 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`brand-logo-mark ${className}`}
      aria-hidden="true"
      {...props}
    >
      <defs>
        {/* Deep emerald gradient badge background */}
        <linearGradient id={bgId} x1="4" y1="4" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#143e2b" />
          <stop offset="50%" stopColor="#1a4d36" />
          <stop offset="100%" stopColor="#0b2418" />
        </linearGradient>

        {/* Back mountain ridge (Mã Pí Lèng backdrop) */}
        <linearGradient id={peakBackId} x1="6" y1="18" x2="27" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#43a074" />
          <stop offset="100%" stopColor="#1e523c" />
        </linearGradient>

        {/* Front mountain faceted ridge (Đồng Văn - Left sunlit face) */}
        <linearGradient id={peakFrontLId} x1="16" y1="12" x2="28" y2="37" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#6ee7b7" />
          <stop offset="60%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#196347" />
        </linearGradient>

        {/* Front mountain faceted ridge (Đồng Văn - Right shaded face) */}
        <linearGradient id={peakFrontRId} x1="26" y1="12" x2="38" y2="37" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#287c61" />
          <stop offset="100%" stopColor="#0d3121" />
        </linearGradient>

        {/* Turquoise winding river (Sông Nho Quế) */}
        <linearGradient id={riverId} x1="10" y1="26" x2="35" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#a7f3d0" />
          <stop offset="50%" stopColor="#2dd4bf" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>

        {/* Golden guide star / AI sparkle (Lũng Cú & Trí tuệ nhân tạo) */}
        <linearGradient id={starId} x1="28" y1="5" x2="37" y2="15" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fef08a" />
          <stop offset="100%" stopColor="#eab308" />
        </linearGradient>
      </defs>

      {/* Squircle badge container */}
      <rect width="44" height="44" rx="11" fill={`url(#${bgId})`} />
      <rect
        x="0.75"
        y="0.75"
        width="42.5"
        height="42.5"
        rx="10.25"
        stroke="rgba(255, 255, 255, 0.16)"
        strokeWidth="1.5"
        fill="none"
      />

      {/* Atmospheric sun aura / morning mist glow */}
      <circle cx="33" cy="11" r="7.5" fill="rgba(254, 240, 138, 0.12)" />

      {/* Far mountain silhouette (Western karst peak) */}
      <path
        d="M5 37 L15 19 L26 37 Z"
        fill={`url(#${peakBackId})`}
        opacity="0.8"
      />

      {/* Grand Karst Summit (Eastern Peak - Faceted 3D Light) */}
      {/* Light facet */}
      <path
        d="M26 12 L16 37 L26 37 Z"
        fill={`url(#${peakFrontLId})`}
      />
      {/* Shadow facet */}
      <path
        d="M26 12 L26 37 L38 37 Z"
        fill={`url(#${peakFrontRId})`}
      />
      {/* Crisp ridge highlight line */}
      <line
        x1="26"
        y1="12"
        x2="26"
        y2="37"
        stroke="rgba(255, 255, 255, 0.35)"
        strokeWidth="0.7"
      />

      {/* River Canyon Curve (Sông Nho Quế ribbon through Tu Sản gorge) */}
      <path
        d="M9 39.5 C15 36, 19.5 33, 23 28.5 C25.5 25, 28 26.5, 33 23"
        stroke={`url(#${riverId})`}
        strokeWidth="3.2"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M11 40.2 C16.5 37.2, 20.5 34.5, 23.8 30.2 C26.2 27, 28.5 28, 33 24"
        stroke="#ffffff"
        strokeWidth="0.9"
        strokeLinecap="round"
        fill="none"
        opacity="0.65"
      />

      {/* Northern Guide Star & AI Sparkle (Lũng Cú & Trợ lý thông minh) */}
      <path
        d="M33 5.5 L34.3 9.7 L38.5 11 L34.3 12.3 L33 16.5 L31.7 12.3 L27.5 11 L31.7 9.7 Z"
        fill={`url(#${starId})`}
      />
      <circle cx="33" cy="11" r="1.3" fill="#ffffff" />

      {/* Tiny secondary sparkle */}
      <circle cx="10" cy="12" r="0.9" fill="rgba(255, 255, 255, 0.45)" />
    </svg>
  );
}
