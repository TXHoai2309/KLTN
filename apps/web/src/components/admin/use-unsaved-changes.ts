"use client";
import { useEffect, useRef } from "react";
type NavigateEvent = Event & {
  destination: { url: string; key?: string };
  canIntercept: boolean;
  hashChange: boolean;
  userInitiated: boolean;
  navigationType: string;
};
export function useUnsavedChanges(dirty: boolean, busy: boolean) {
  const state = useRef({ dirty, busy });
  state.current = { dirty, busy };
  useEffect(() => {
    let prompt: HTMLDialogElement | null = null;
    function confirmLeave(resume: () => void) {
      if (prompt) return;
      const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const dialog = document.createElement("dialog");
      prompt = dialog;
      dialog.className = "af-leave-dialog";
      const title = document.createElement("h2"), message = document.createElement("p"), actions = document.createElement("div");
      title.id = "admin-leave-title"; message.id = "admin-leave-message";
      title.textContent = state.current.busy ? "Thao tác chưa hoàn tất" : "Rời trang với thay đổi chưa lưu?";
      message.textContent = state.current.busy ? "Hoàn tất thao tác đang chờ hoặc đọc lại và thử lưu trước khi rời trang." : "Các thay đổi đang nhập sẽ không được lưu.";
      dialog.setAttribute("aria-labelledby", title.id); dialog.setAttribute("aria-describedby", message.id);
      const cancel = document.createElement("button"); cancel.type = "button"; cancel.className = "af-btn"; cancel.textContent = "Ở lại"; cancel.autofocus = true;
      cancel.addEventListener("click", () => dialog.close()); actions.append(cancel);
      if (!state.current.busy) {
        const leave = document.createElement("button"); leave.type = "button"; leave.className = "af-btn"; leave.textContent = "Rời trang";
        leave.addEventListener("click", () => {state.current = {dirty: false,busy: false}; dialog.close(); resume();}); actions.append(leave);
      }
      dialog.addEventListener("close", () => {dialog.remove(); prompt = null; opener?.focus();}, {once:true});
      dialog.append(title,message,actions); (document.querySelector(".af-root") ?? document.body).append(dialog); dialog.showModal();
    }
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
      if (state.current.dirty || state.current.busy) {
        event.preventDefault(); event.stopPropagation();
        confirmLeave(() => anchor.click());
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
      if (state.current.dirty || state.current.busy) {
        nav.preventDefault();
        confirmLeave(() => {
          const api = navigation as (EventTarget & {traverseTo?: (key:string)=>unknown}) | undefined;
          if (nav.destination.key && api?.traverseTo) api.traverseTo(nav.destination.key);
          else window.history.back();
        });
      }
    }
    window.addEventListener("click", click, true);
    window.addEventListener("beforeunload", unload);
    navigation?.addEventListener("navigate", navigate);
    return () => {
      prompt?.remove();
      window.removeEventListener("click", click, true);
      window.removeEventListener("beforeunload", unload);
      navigation?.removeEventListener("navigate", navigate);
    };
  }, []);
  return () => {
    state.current = { dirty: false, busy: false };
  };
}
