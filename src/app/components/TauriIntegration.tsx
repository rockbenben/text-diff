"use client";

import { useEffect } from "react";
import { useAutoUpdate } from "@/app/hooks/useAutoUpdate";
import { isTauriRuntime } from "@/app/utils/externalLink";

// Desktop-only behaviors. No-ops outside a Tauri webview, so it's safe on the web.
// Language switching is plain soft navigation (handled by the language selector) —
// no redirect hook here, matching the working img-prompt setup.
export default function TauriIntegration() {
  useAutoUpdate();

  // Send external links to the system browser. Without this, clicking an external
  // <a> navigates the app's own webview away from the tool. One capture-phase
  // delegate covers every link; same-origin links fall through to Next's router.
  useEffect(() => {
    if (!isTauriRuntime()) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as Element | null)?.closest?.("a");
      const href = anchor?.getAttribute("href");
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
      (async () => {
        try {
          const { openUrl } = await import("@tauri-apps/plugin-opener");
          await openUrl(url.href);
        } catch (err) {
          // Safety net while we confirm the opener permission scope is correct.
          alert("openUrl FAILED:\n" + String(err));
        }
      })();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
