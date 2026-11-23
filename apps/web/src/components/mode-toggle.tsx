"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@KLTN/ui/components/button";
import { cn } from "@KLTN/ui/lib/utils";

export function resolveNextTheme(input: {
  mounted: boolean;
  theme: string | undefined;
  resolvedTheme: string | undefined;
  domDark?: boolean;
}): "light" | "dark" {
  const currentlyDark = input.mounted
    ? (input.resolvedTheme ?? input.theme) === "dark"
    : Boolean(input.domDark) || (input.resolvedTheme ?? input.theme) === "dark";
  return currentlyDark ? "light" : "dark";
}

/**
 * Direct light/dark theme toggle (K1): clicking always flips directly between
 * explicit "light" and "dark" themes regardless of OS prefers-color-scheme.
 */
export type ModeToggleProps = {
  className?: string;
  locale?: "en" | "vi";
};

export function ModeToggle({ className, locale = "en" }: ModeToggleProps) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const isVietnamese = locale === "vi";

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const currentResolved = mounted ? (resolvedTheme ?? theme) : "light";
  const isDark = currentResolved === "dark";

  const label = isVietnamese ? "Chuyển giao diện sáng/tối" : "Toggle theme";
  const title = isVietnamese
    ? isDark
      ? "Đang ở chế độ tối — bấm để chuyển sang chế độ sáng"
      : "Đang ở chế độ sáng — bấm để chuyển sang chế độ tối"
    : isDark
      ? "Dark mode active — switch to light mode"
      : "Light mode active — switch to dark mode";

  const handleToggle = () => {
    const domDark =
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark");
    setTheme(resolveNextTheme({ mounted, theme, resolvedTheme, domDark }));
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={handleToggle}
      aria-label={label}
      aria-pressed={isDark}
      title={title}
      data-theme-toggle={isDark ? "dark" : "light"}
      className={cn("relative", className)}
    >
      <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">{label}</span>
    </Button>
  );
}
