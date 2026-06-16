"use client";

import { getPreferredLanguage, setPreferredLanguage } from "./languageStorage";
import { isTauri } from "./externalLink";

// Language-preference management for the Tauri desktop app. Persistence rides on
// the webview's localStorage (which survives relaunches); this wrapper keeps the
// Tauri-specific bits — startup init and system-language detection — in one place.
export class TauriLanguageManager {
  private static instance: TauriLanguageManager;

  static getInstance(): TauriLanguageManager {
    if (!TauriLanguageManager.instance) {
      TauriLanguageManager.instance = new TauriLanguageManager();
    }
    return TauriLanguageManager.instance;
  }

  // Resolve the saved language preference on startup (null if none).
  async initializeLanguage(): Promise<string | null> {
    if (!(await isTauri())) return null;
    try {
      return getPreferredLanguage();
    } catch (error) {
      console.error("Tauri: failed to initialize language:", error);
      return null;
    }
  }

  async saveLanguagePreference(language: string): Promise<void> {
    if (!(await isTauri())) return;
    try {
      setPreferredLanguage(language);
    } catch (error) {
      console.error("Tauri: failed to save language preference:", error);
    }
  }

  // Best-effort map of the OS/webview language to a supported app locale.
  getSystemLanguage(): string {
    if (typeof window === "undefined") return "en";
    try {
      const systemLang = navigator.language || navigator.languages?.[0] || "en";
      if (systemLang.startsWith("zh")) {
        if (systemLang.includes("TW") || systemLang.includes("HK") || systemLang.includes("Hant")) {
          return "zh-hant";
        }
        return "zh";
      }
      return systemLang.split("-")[0];
    } catch (error) {
      console.error("Failed to detect system language:", error);
      return "en";
    }
  }
}

export const tauriLanguageManager = TauriLanguageManager.getInstance();
