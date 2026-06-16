"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { getPreferredLanguage, setPreferredLanguage, getCurrentLanguageFromPath, isValidLanguage } from "@/app/utils/languageStorage";
import { tauriLanguageManager } from "@/app/utils/tauriLanguage";
import { isTauri } from "@/app/utils/externalLink";

interface UseLanguagePreferenceOptions {
  validLanguages: string[];
  defaultLanguage?: string;
}

// Remembers the user's chosen language across launches. On startup it redirects
// to the saved locale (or, on first run in the desktop app, the system locale);
// thereafter it persists whatever locale the user navigates to.
export const useLanguagePreference = ({ validLanguages }: UseLanguagePreferenceOptions) => {
  const pathname = usePathname();
  const router = useRouter();
  const currentLocale = useLocale();
  const [isInitialized, setIsInitialized] = useState(false);
  const [isTauriApp, setIsTauriApp] = useState(false);
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    isTauri().then(setIsTauriApp);
  }, []);

  // Startup: redirect to the preferred/system language if it differs from the URL.
  useEffect(() => {
    if (hasInitializedRef.current) return;

    const initializeLanguage = async () => {
      let preferredLanguage: string | null = null;

      if (isTauriApp) {
        preferredLanguage = await tauriLanguageManager.initializeLanguage();
        if (!preferredLanguage) {
          const systemLang = tauriLanguageManager.getSystemLanguage();
          if (isValidLanguage(systemLang, validLanguages)) {
            preferredLanguage = systemLang;
            await tauriLanguageManager.saveLanguagePreference(systemLang);
          }
        }
      } else {
        preferredLanguage = getPreferredLanguage();
      }

      const currentLanguage = getCurrentLanguageFromPath(pathname);

      if (preferredLanguage && isValidLanguage(preferredLanguage, validLanguages) && preferredLanguage !== currentLanguage) {
        const newPath = pathname.replace(/^\/[a-z]{2}(-[a-z]+)?/i, `/${preferredLanguage}`);
        hasInitializedRef.current = true;
        if (isTauriApp) {
          // Hard-load a trailing-slashed path: Tauri's asset server resolves
          // /zh/ → /zh/index.html, but soft RSC navigation fails over the
          // custom protocol, which would leave the app stuck on the entry locale.
          const slashed = newPath.endsWith("/") ? newPath : `${newPath}/`;
          window.location.replace(slashed);
        } else {
          router.replace(newPath);
        }
        return;
      }

      hasInitializedRef.current = true;
      setIsInitialized(true);
    };

    initializeLanguage();
  }, [pathname, router, validLanguages, isTauriApp]);

  // Persist the locale whenever the user navigates to a new one (debounced so we
  // don't save mid-redirect).
  useEffect(() => {
    if (!isInitialized) return;
    const currentLanguage = getCurrentLanguageFromPath(pathname);
    if (!isValidLanguage(currentLanguage, validLanguages)) return;

    const timeoutId = setTimeout(() => {
      if (!hasInitializedRef.current) return;
      if (isTauriApp) {
        tauriLanguageManager.saveLanguagePreference(currentLanguage);
      } else {
        setPreferredLanguage(currentLanguage);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [pathname, validLanguages, isInitialized, isTauriApp]);

  return { currentLanguage: currentLocale, isInitialized, isTauriApp };
};
