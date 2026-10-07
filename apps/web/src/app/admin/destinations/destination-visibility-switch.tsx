"use client";
import React, { type MouseEventHandler } from "react";
import { LoaderCircle } from "lucide-react";

/** Controlled presentation only: checked always comes from confirmed data. */
export default function DestinationVisibilitySwitch({ name, visibility, disabled = false, pending = false, onClick }: {
  name: string;
  visibility: "HIDDEN" | "VISIBLE";
  disabled?: boolean;
  pending?: boolean;
  onClick: MouseEventHandler<HTMLButtonElement>;
}) {
  const checked = visibility === "VISIBLE";
  return <span className="destination-switch-status">
    <button type="button" role="switch" className="destination-visibility-switch"
      aria-checked={checked} aria-label={`${checked ? "Ẩn" : "Hiển thị"} ${name}`}
      aria-busy={pending} disabled={disabled || pending} onClick={onClick}>
      <span className="destination-switch-track" aria-hidden="true"><span className="destination-switch-thumb" /></span>
    </button>
    {pending ? <>
      <LoaderCircle className="destination-spinner destination-switch-spinner" size={14} aria-hidden="true" />
      <span className="destination-switch-label" role="status">Đang cập nhật...</span>
    </> : <span className="destination-switch-label">{checked ? "Đang hiển thị" : "Đang ẩn"}</span>}
  </span>;
}
