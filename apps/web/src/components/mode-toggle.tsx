"use client";

import { Button } from "@KLTN/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@KLTN/ui/components/dropdown-menu";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import * as React from "react";

export function ModeToggle({
  className,
  locale = "en",
}: {
  className?: string;
  locale?: "en" | "vi";
} = {}) {
  const { setTheme } = useTheme();
  const isVietnamese = locale === "vi";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="icon" className={className} />}>
        <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        <span className="sr-only">{isVietnamese ? "Chuyển giao diện sáng/tối" : "Toggle theme"}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>{isVietnamese ? "Sáng" : "Light"}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>{isVietnamese ? "Tối" : "Dark"}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          {isVietnamese ? "Theo thiết bị" : "System"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
