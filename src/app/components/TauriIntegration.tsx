"use client";

import { useEffect } from "react";
import { useAutoUpdate } from "@/app/hooks/useAutoUpdate";
import { useLanguagePreference } from "@/app/hooks/useLanguagePreference";
import { isTauriRuntime, openExternalLink } from "@/app/utils/externalLink";
import { routing } from "@/i18n/routing";

// Mounts the desktop-only behaviors: auto-update checks and language persistence.
// Both hooks no-op outside a Tauri webview, so this is safe to render on the web.
export default function TauriIntegration() {
  useAutoUpdate();
  useLanguagePreference({ validLanguages: [...routing.locales], defaultLanguage: routing.defaultLocale });

  // Route external links to the system browser. Without this, clicking an <a> to
  // an external site navigates the app's own webview away from the tool. A single
  // capture-phase delegate covers every link (existing and future) without having
  // to wrap each one. Internal/same-origin links fall through to Next's router.
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
      openExternalLink(url.href);
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
