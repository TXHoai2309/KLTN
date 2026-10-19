"use client";

import type { ComponentProps } from "react";
import { Input } from "@KLTN/ui/components/input";
import { formatVietnameseDate, vietnameseDateInputValue } from "@/lib/date-only";

type VietnameseDateInputProps = Omit<ComponentProps<"input">, "type" | "value" | "defaultValue" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
};

/** Typed date owner: fixed Vietnamese display, ISO value, no OS-owned date popup. */
export function VietnameseDateInput({ value, onChange, ...props }: VietnameseDateInputProps) {
  return <Input
    {...props}
    type="text"
    placeholder="dd/mm/yyyy"
    maxLength={10}
    value={formatVietnameseDate(value)}
    onChange={(event) => onChange(vietnameseDateInputValue(event.target.value))}
  />;
}
