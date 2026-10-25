"use client";

import { Toaster } from "@KLTN/ui/components/sonner";

import { ThemeProvider } from "./theme-provider";
import { AuthRequiredProvider } from "./auth-required-provider";
import { GlobalAssistantProvider } from "./assistant/global-assistant";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      <AuthRequiredProvider>
        <GlobalAssistantProvider>{children}</GlobalAssistantProvider>
        <Toaster richColors />
      </AuthRequiredProvider>
    </ThemeProvider>
  );
}
