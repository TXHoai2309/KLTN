import type { ButtonHTMLAttributes, ReactNode } from "react";
import { LoaderCircle } from "lucide-react";

export type TravelerButtonVariant = "primary" | "secondary" | "text" | "link" | "danger" | "icon";
export type TravelerButtonSize = "sm" | "md" | "lg";

export function travelerButtonClassName({
  variant = "secondary",
  size = "md",
  loading = false,
  className,
}: {
  variant?: TravelerButtonVariant;
  size?: TravelerButtonSize;
  loading?: boolean;
  className?: string;
} = {}): string {
  return [
    "tv-btn",
    `tv-btn--${variant}`,
    `tv-btn--${size}`,
    loading ? "tv-btn--loading" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}

export interface TravelerButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: TravelerButtonVariant;
  size?: TravelerButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
}

export function TravelerButton({
  variant = "secondary",
  size = "md",
  loading = false,
  icon,
  children,
  className,
  type = "button",
  disabled,
  ...rest
}: TravelerButtonProps) {
  return (
    <button
      type={type}
      className={travelerButtonClassName({ variant, size, loading, className })}
      disabled={disabled}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <LoaderCircle size={14} className="tv-btn-spinner" aria-hidden="true" />
      ) : icon ? (
        <span className="tv-btn-icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {children}
    </button>
  );
}
