import { Be_Vietnam_Pro, Noto_Serif } from "next/font/google";
import "./explore.css";

const body = Be_Vietnam_Pro({ weight: ["400", "500", "600"], subsets: ["latin", "vietnamese"], variable: "--font-explore-body", display: "swap" });
const heading = Noto_Serif({ weight: "600", subsets: ["latin", "vietnamese"], variable: "--font-explore-heading", display: "swap" });

export default function ExploreLayout({ children }: { children: React.ReactNode }) {
  return <div className={`explore-shell ${body.variable} ${heading.variable}`}>{children}</div>;
}
