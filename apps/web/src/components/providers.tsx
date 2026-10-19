"use client";

import { Toaster } from "@KLTN/ui/components/sonner";

import { ThemeProvider } from "./theme-provider";
import { AuthRequiredProvider } from "./auth-required-provider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <AuthRequiredProvider>
        {children}
        <Toaster richColors />
      </AuthRequiredProvider>
    </ThemeProvider>
  );
}
