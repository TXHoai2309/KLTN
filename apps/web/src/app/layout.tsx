import type { Metadata, Viewport } from "next";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
};

export const metadata: Metadata = {
  title: "KLTN",
  description: "KLTN",
};
import { Geist, Geist_Mono, Be_Vietnam_Pro, Lora } from "next/font/google";

import "../index.css";
import "../components/published-content-profile.css";
import "../components/editorial/editorial.css";
import "../components/editorial/editorial-generative.css";
import "../components/map/map.css";
import "../components/auth-required-dialog.css";
import "../components/assistant/assistant.css";
import "../components/assistant/destination-panel.css";
import "../components/assistant/assistant-launcher.css";
import "maplibre-gl/dist/maplibre-gl.css";
import Header from "@/components/header";
import Providers from "@/components/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const beVietnamPro = Be_Vietnam_Pro({
  variable: "--font-be-vietnam",
  subsets: ["latin", "vietnamese"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
});
const editorialSerif = Lora({ variable: "--font-editorial-serif", subsets: ["latin", "vietnamese"], display: "swap" });



export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} ${beVietnamPro.variable} ${editorialSerif.variable} antialiased`}>
        <Providers>
          <div className="grid grid-rows-[auto_1fr] min-h-svh">
            <Header />
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
