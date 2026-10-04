import React, { type ReactNode } from "react";
import { Eye, EyeOff, LoaderCircle, type LucideIcon } from "lucide-react";

export function SectionHeading({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return <div className="destination-section-heading"><span className="destination-section-icon" aria-hidden="true"><Icon size={21} /></span><div><h2>{title}</h2><p>{description}</p></div></div>;
}
export function VisibilityBadge({ visibility }: { visibility: "HIDDEN" | "VISIBLE" }) {
  const Icon = visibility === "VISIBLE" ? Eye : EyeOff;
  return <span className={`destination-badge ${visibility === "VISIBLE" ? "is-visible" : "is-hidden"}`}><Icon size={14} aria-hidden="true" />{visibility === "VISIBLE" ? "Đang hiển thị" : "Đang ẩn"}</span>;
}
export function LoadingState({ children }: { children: ReactNode }) {
  return <div className="destination-state" role="status"><LoaderCircle size={24} className="destination-spinner" aria-hidden="true" /><p>{children}</p></div>;
}
