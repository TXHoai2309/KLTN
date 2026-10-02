"use client";

import { useState, useRef, useEffect } from "react";

import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";

export default function AuthModeSwitcher({ returnTo }: { returnTo: string }) {
  const [showSignIn, setShowSignIn] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function switchMode(toSignIn: boolean) {
    if (animating) return;
    setDirection(toSignIn ? "forward" : "back");
    setAnimating(true);
    timerRef.current = setTimeout(() => {
      setShowSignIn(toSignIn);
      setAnimating(false);
    }, 260);
  }

  return (
    <main className="auth-shell">
      <div className="auth-form-column">
        <div
          className={`auth-form-animator ${
            animating
              ? direction === "forward"
                ? "auth-form-exit-left"
                : "auth-form-exit-right"
              : "auth-form-enter"
          }`}
        >
          {showSignIn ? (
            <SignInForm returnTo={returnTo} onSwitchToSignUp={() => switchMode(false)} />
          ) : (
            <SignUpForm returnTo={returnTo} onSwitchToSignIn={() => switchMode(true)} />
          )}
        </div>
      </div>
    </main>
  );
}
