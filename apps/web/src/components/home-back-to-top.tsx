"use client";

import { ArrowUp } from "lucide-react";

export default function HomeBackToTop() {
  const handleScrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <button
      type="button"
      onClick={handleScrollToTop}
      className="home-footer-back-top"
      aria-label="Cuộn lên đầu trang"
    >
      <span>Về đầu trang</span>
      <ArrowUp size={15} aria-hidden="true" />
    </button>
  );
}
