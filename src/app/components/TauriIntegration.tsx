"use client";

import { useEffect } from "react";
import { useAutoUpdate } from "@/app/hooks/useAutoUpdate";
import { isTauriRuntime, openExternalLink } from "@/app/utils/externalLink";

// Desktop-only behaviors; no-ops outside a Tauri webview, so safe to render on web.
// Language switching is plain soft navigation (handled by the language selector),
// which works in the webview without touching the asset protocol — no redirect hook.
export default function TauriIntegration() {
  useAutoUpdate();

  // Send external links to the system browser. Without this, clicking an external
  // <a> would navigate the app's own webview away from the tool. One capture-phase
  // delegate covers every link; same-origin links fall through to Next's router.
  useEffect(() => {
    if (!isTauriRuntime()) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const href = (e.target as Element | null)?.closest?.("a")?.getAttribute("href");
      if (!href) return;
      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      const isWebExternal = (url.protocol === "http:" || url.protocol === "https:") && url.origin !== window.location.origin;
      const isMailOrTel = url.protocol === "mailto:" || url.protocol === "tel:";
      if (!isWebExternal && !isMailOrTel) return;
      e.preventDefault();
      e.stopPropagation();
      openExternalLink(url.href);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
