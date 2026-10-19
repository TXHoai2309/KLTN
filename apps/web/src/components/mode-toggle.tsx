"use client";

import { Button } from "@KLTN/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@KLTN/ui/components/dropdown-menu";
import { cn } from "@KLTN/ui/lib/utils";
import { Check, Laptop, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import * as React from "react";

const THEME_OPTIONS = [
  {
    value: "light",
    labelVi: "Sáng",
    labelEn: "Light",
    icon: Sun,
    iconColor: "text-amber-500 dark:text-amber-400",
    iconBg: "bg-amber-500/10 dark:bg-amber-500/20",
  },
  {
    value: "dark",
    labelVi: "Tối",
    labelEn: "Dark",
    icon: Moon,
    iconColor: "text-indigo-500 dark:text-indigo-400",
    iconBg: "bg-indigo-500/10 dark:bg-indigo-500/20",
  },
  {
    value: "system",
    labelVi: "Theo thiết bị",
    labelEn: "System",
    icon: Laptop,
    iconColor: "text-emerald-600 dark:text-emerald-400",
    iconBg: "bg-emerald-500/10 dark:bg-emerald-500/20",
  },
] as const;

export function ModeToggle({
  className,
  locale = "en",
}: {
  className?: string;
  locale?: "en" | "vi";
} = {}) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const isVietnamese = locale === "vi";

  React.useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="icon"
            className={className}
            aria-label={isVietnamese ? "Chuyển giao diện sáng/tối" : "Toggle theme"}
          />
        }
      >
        <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        <span className="sr-only">{isVietnamese ? "Chuyển giao diện sáng/tối" : "Toggle theme"}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-48 rounded-2xl border border-border/80 bg-card/95 p-1.5 shadow-xl shadow-black/8 backdrop-blur-md dark:border-border/60 dark:bg-card/95 dark:shadow-black/40"
      >
        <div className="flex items-center justify-between px-2.5 py-1.5 select-none">
          <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
            {isVietnamese ? "Giao diện" : "Appearance"}
          </span>
          {mounted && (
            <span className="rounded-full bg-muted/80 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
              {theme === "light"
                ? isVietnamese
                  ? "Sáng"
                  : "Light"
                : theme === "dark"
                  ? isVietnamese
                    ? "Tối"
                    : "Dark"
                  : isVietnamese
                    ? "Tự động"
                    : "Auto"}
            </span>
          )}
        </div>
        <div className="my-1 h-px bg-border/40" />
        <div className="space-y-0.5">
          {THEME_OPTIONS.map((item) => {
            const isSelected = mounted && theme === item.value;
            const Icon = item.icon;
            return (
              <DropdownMenuItem
                key={item.value}
                onClick={() => setTheme(item.value)}
                className={cn(
                  "group relative flex cursor-pointer items-center justify-between gap-2.5 rounded-xl px-2.5 py-2 text-xs font-medium transition-all duration-150 select-none outline-none",
                  isSelected
                    ? "bg-emerald-500/10 text-emerald-950 font-semibold dark:bg-emerald-500/15 dark:text-emerald-300"
                    : "text-foreground/80 hover:bg-muted/70 hover:text-foreground focus:bg-muted/70 focus:text-foreground"
                )}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-md transition-all duration-150 group-hover:scale-105",
                      item.iconBg,
                      item.iconColor
                    )}
                  >
                    <Icon className="size-3.5" />
                  </span>
                  <span>{isVietnamese ? item.labelVi : item.labelEn}</span>
                </div>
                {isSelected && (
                  <Check className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400 stroke-[2.5]" />
                )}
              </DropdownMenuItem>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
