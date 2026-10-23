import { Be_Vietnam_Pro, Noto_Serif } from "next/font/google";

import "./trip-form.css";
import "./trip-planning-layout.css";

const tripBody = Be_Vietnam_Pro({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin", "vietnamese"],
  variable: "--font-trip-body",
  display: "swap",
});

const tripHeading = Noto_Serif({
  weight: ["500", "600", "700"],
  subsets: ["latin", "vietnamese"],
  variable: "--font-trip-heading",
  display: "swap",
});

export default function NewTripLayout({ children }: { children: React.ReactNode }) {
  return <div className={`trip-shell ${tripBody.variable} ${tripHeading.variable}`}>{children}</div>;
}

