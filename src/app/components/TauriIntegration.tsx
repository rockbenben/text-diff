"use client";

import { useAutoUpdate } from "@/app/hooks/useAutoUpdate";
import { useLanguagePreference } from "@/app/hooks/useLanguagePreference";
import { routing } from "@/i18n/routing";

// Mounts the desktop-only behaviors: auto-update checks and language persistence.
// Both hooks no-op outside a Tauri webview, so this is safe to render on the web.
export default function TauriIntegration() {
  useAutoUpdate();
  useLanguagePreference({ validLanguages: [...routing.locales], defaultLanguage: routing.defaultLocale });
  return null;
}
