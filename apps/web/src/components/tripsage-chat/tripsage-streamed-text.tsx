"use client";

import { useEffect, useRef, useState } from "react";
import { TripsageMarkdown } from "./tripsage-markdown";

/**
 * Shows a reply that arrives in bursts as steady typing. A message first mounted while the turn is streaming types in and then
 * stays full; a stored or finished message renders in full at once. Reduced-motion users always get the full text.
 */
export function TripsageStreamedText({ text, live }: { text: string; live: boolean }) {
  const animated = useRef(live);
  const [shown, setShown] = useState(live ? 0 : text.length);
  const target = useRef(text.length);
  target.current = text.length;

  useEffect(() => {
    if (!animated.current) { setShown(text.length); return; }
    if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) { animated.current = false; setShown(text.length); return; }
    let frame = 0;
    const step = () => {
      setShown(current => {
        const remaining = target.current - current;
        if (remaining <= 0) return current;
        // Catch up in roughly a third of a second whatever the burst size, never slower than 2 characters a frame.
        return current + Math.min(remaining, Math.max(2, Math.ceil(remaining / 18)));
      });
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [text.length]);

  useEffect(() => { if (!live && shown >= text.length) animated.current = false; }, [live, shown, text.length]);

  return <TripsageMarkdown text={shown >= text.length ? text : text.slice(0, shown)} />;
}
