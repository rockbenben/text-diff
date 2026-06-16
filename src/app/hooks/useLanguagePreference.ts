"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { getPreferredLanguage, setPreferredLanguage, getCurrentLanguageFromPath, isValidLanguage } from "@/app/utils/languageStorage";
import { tauriLanguageManager } from "@/app/utils/tauriLanguage";
import { isTauriRuntime } from "@/app/utils/externalLink";

interface UseLanguagePreferenceOptions {
  validLanguages: string[];
  defaultLanguage?: string;
}

// Once per app session we may redirect to the remembered locale. The flag (Tauri
// only) stops the startup redirect from bouncing an explicit in-app language
// switch back to the saved preference — the bug that made switching impossible.
const SESSION_REDIRECT_KEY = "textdiff_lang_session_redirect";

// Remembers the user's chosen language across launches. On the first load of an
// app session it redirects to the saved locale (or, on a fresh desktop install,
// the system locale); after that it just persists whatever locale is shown.
export const useLanguagePreference = ({ validLanguages }: UseLanguagePreferenceOptions) => {
  const pathname = usePathname();
  const router = useRouter();
  const currentLocale = useLocale();
  const [isInitialized, setIsInitialized] = useState(false);
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    const tauri = isTauriRuntime();
    const currentLanguage = getCurrentLanguageFromPath(pathname);

    // Resolve preference: saved value, else (desktop, first run) system language.
    let preferred = getPreferredLanguage();
    if (!preferred && tauri) {
      const sys = tauriLanguageManager.getSystemLanguage();
      if (isValidLanguage(sys, validLanguages)) {
        preferred = sys;
        setPreferredLanguage(sys);
      }
    }

    // In Tauri, only allow ONE startup redirect per session (hard nav remounts the
    // hook on every page, so without this an explicit switch is bounced back).
    let alreadyRedirected = false;
    if (tauri) {
      try {
        alreadyRedirected = sessionStorage.getItem(SESSION_REDIRECT_KEY) === "1";
      } catch {}
    }

    if (!alreadyRedirected && preferred && isValidLanguage(preferred, validLanguages) && preferred !== currentLanguage) {
      const next = pathname.replace(/^\/[a-z]{2}(-[a-z]+)?/i, `/${preferred}`);
      if (tauri) {
        try {
          sessionStorage.setItem(SESSION_REDIRECT_KEY, "1");
        } catch {}
        // Hard nav to a trailing-slashed path — soft nav doesn't resolve over
        // Tauri's asset protocol.
        window.location.replace(next.endsWith("/") ? next : `${next}/`);
      } else {
        router.replace(next);
      }
      return;
    }

    setIsInitialized(true);
  }, [pathname, router, validLanguages]);

  // Persist the current locale so the next launch remembers it.
  useEffect(() => {
    if (!isInitialized) return;
    const currentLanguage = getCurrentLanguageFromPath(pathname);
    if (!isValidLanguage(currentLanguage, validLanguages)) return;
    const t = setTimeout(() => setPreferredLanguage(currentLanguage), 300);
    return () => clearTimeout(t);
  }, [pathname, validLanguages, isInitialized]);

  return { currentLanguage: currentLocale, isInitialized };
};
