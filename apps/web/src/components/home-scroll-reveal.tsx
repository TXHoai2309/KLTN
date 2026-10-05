"use client";

import { useEffect, useRef, type ReactNode } from "react";

export default function HomeScrollReveal({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = root.current;
    if (!container) return;

    const targets = [...container.querySelectorAll<HTMLElement>("[data-home-reveal]")];
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion || !("IntersectionObserver" in window)) {
      targets.forEach(target => { target.dataset.homeRevealed = "true"; });
      container.dataset.homeRevealReady = "true";
      return;
    }

    for (const target of targets) {
      if (target.getBoundingClientRect().top <= window.innerHeight * 0.92) target.dataset.homeRevealed = "true";
      else target.dataset.homeRevealPending = "true";
    }
    container.dataset.homeRevealReady = "true";

    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const target = entry.target as HTMLElement;
        delete target.dataset.homeRevealPending;
        target.dataset.homeRevealed = "true";
        observer.unobserve(target);
      }
    }, { rootMargin: "0px 0px -6% 0px", threshold: 0.12 });

    targets.filter(target => target.dataset.homeRevealPending === "true").forEach(target => observer.observe(target));
    return () => observer.disconnect();
  }, []);

  return <div ref={root} className="home-reveal-root">{children}</div>;
}
