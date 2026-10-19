"use client";

import Link from "next/link";
import type { Route } from "next";
import { Sparkles } from "lucide-react";
import { useState } from "react";

export interface DestinationAiFabProps {
  destinationId: string;
  destinationName?: string;
  className?: string;
}

export function DestinationAiFab({
  destinationId,
  destinationName,
  className = "",
}: DestinationAiFabProps) {
  const [isHovered, setIsHovered] = useState(false);

  const assistantHref = `/assistant?destinationId=${encodeURIComponent(destinationId)}` as Route;
  const labelText = destinationName
    ? `Hỏi trợ lý AI về ${destinationName}`
    : "Hỏi trợ lý AI về điểm đến này";

  return (
    <aside
      className={`destination-ai-fab-wrapper ${className}`}
      aria-label="Trợ lý AI điểm đến"
    >
      <Link
        href={assistantHref}
        className="destination-ai-fab-button"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        aria-label={labelText}
      >
        {/* Radar pulse wave effect */}
        <span className="destination-ai-fab-sonar" aria-hidden="true" />
        <span className="destination-ai-fab-sonar-delayed" aria-hidden="true" />

        {/* Ambient background glow */}
        <span className="destination-ai-fab-glow" aria-hidden="true" />

        {/* Central Icon */}
        <span className="destination-ai-fab-icon-box" aria-hidden="true">
          <Sparkles className="destination-ai-fab-icon" size={24} />
        </span>

        {/* Active online badge dot */}
        <span className="destination-ai-fab-status-dot" aria-hidden="true" />

        {/* Expanding label on desktop */}
        <span className="destination-ai-fab-text">
          Hỏi trợ lý AI
        </span>

        {/* Tooltip bubble appearing above the button on hover */}
        <span
          className={`destination-ai-fab-tooltip ${isHovered ? "is-visible" : ""}`}
          role="tooltip"
        >
          {labelText}
        </span>
      </Link>
    </aside>
  );
}

export default DestinationAiFab;
