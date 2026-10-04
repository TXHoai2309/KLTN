"use client";
import React, { type MouseEventHandler } from "react";

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
    <span className="destination-switch-label">{checked ? "Đang hiển thị" : "Đang ẩn"}</span>
    {pending && <span className="destination-sr-only" role="status">Đang cập nhật…</span>}
  </span>;
}
