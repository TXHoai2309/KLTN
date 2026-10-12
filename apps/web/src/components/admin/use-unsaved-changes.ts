"use client";
import { useEffect, useRef } from "react";
type NavigateEvent = Event & {
  destination: { url: string };
  canIntercept: boolean;
  hashChange: boolean;
  userInitiated: boolean;
  navigationType: string;
};
export function useUnsavedChanges(dirty: boolean, busy: boolean) {
  const state = useRef({ dirty, busy });
  state.current = { dirty, busy };
  useEffect(() => {
    const canLeave = () => {
      if (state.current.busy) {
        window.alert(
          "Vui lòng hoàn tất thao tác đang chờ hoặc đọc lại và thử lưu trước khi rời trang.",
        );
        return false;
      }
      return (
        !state.current.dirty ||
        window.confirm(
          "Bạn có thay đổi chưa lưu. Rời trang và bỏ các thay đổi này?",
        )
      );
    };
    function click(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        !(event.target instanceof Element)
      )
        return;
      const anchor = event.target.closest<HTMLAnchorElement>("a[href]");
      if (
        !anchor ||
        anchor.target === "_blank" ||
        anchor.hasAttribute("download")
      )
        return;
      const url = new URL(anchor.href, location.href);
      if (
        url.origin === location.origin &&
        url.pathname === location.pathname &&
        url.search === location.search
      )
        return;
      if (!canLeave()) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
    function unload(event: BeforeUnloadEvent) {
      if (state.current.dirty || state.current.busy) {
        event.preventDefault();
        event.returnValue = "";
      }
    }
    // Navigation API covers same-document Back/Forward, beyond link capture.
    const navigation = (window as unknown as { navigation?: EventTarget })
      .navigation;
    function navigate(event: Event) {
      const nav = event as NavigateEvent;
      if (
        nav.navigationType !== "traverse" ||
        !nav.cancelable ||
        nav.hashChange
      )
        return;
      if (!canLeave()) nav.preventDefault();
    }
    window.addEventListener("click", click, true);
    window.addEventListener("beforeunload", unload);
    navigation?.addEventListener("navigate", navigate);
    return () => {
      window.removeEventListener("click", click, true);
      window.removeEventListener("beforeunload", unload);
      navigation?.removeEventListener("navigate", navigate);
    };
  }, []);
  return () => {
    state.current = { dirty: false, busy: false };
  };
}
