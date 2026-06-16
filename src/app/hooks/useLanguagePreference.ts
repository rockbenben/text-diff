"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isTauriRuntime } from "@/app/utils/externalLink";

const KEY = "textdiff_preferred_language";

// Persist the chosen locale. Called explicitly from the language switcher on a
// user action — NOT from a navigation effect (which raced the startup redirect).
export const setPreferredLanguage = (locale: string) => {
  try {
    localStorage.setItem(KEY, locale);
  } catch {
    /* ignore */
  }
};

const read = (): string | null => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

const localeOfPath = (pathname: string): string | null => pathname.match(/^\/([a-z]{2}(-[a-z]+)?)/i)?.[1] ?? null;

const systemLocale = (): string => {
  const s = (typeof navigator !== "undefined" && navigator.language) || "en";
  if (s.startsWith("zh")) return /TW|HK|Hant/i.test(s) ? "zh-hant" : "zh";
  return s.split("-")[0];
};

// MODULE-LEVEL, not a ref: switching locale remounts the [locale] layout subtree
// (and therefore this hook's host), which would reset a useRef and re-fire the
// startup redirect on every switch — the bounce that "broke" switching. A module
// variable survives remounts and only resets when the app's JS context reloads
// (i.e. a real app launch), so the redirect runs exactly once per session.
let sessionRedirectDone = false;

// Desktop-only: open in the remembered language (or, on first run, the system
// language). It ONLY redirects once at launch; it never persists on navigation —
// the switcher saves the preference — so it can't fight an in-session switch.
export function useLanguagePreference(validLocales: string[]) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (sessionRedirectDone || !isTauriRuntime()) return;
    const current = localeOfPath(pathname);
    if (!current) return; // wait for a locale-bearing path
    sessionRedirectDone = true;

    let preferred = read();
    if (!preferred) {
      const sys = systemLocale();
      if (validLocales.includes(sys)) {
        preferred = sys;
        setPreferredLanguage(sys);
      }
    }
    if (preferred && validLocales.includes(preferred) && preferred !== current) {
      router.replace(pathname.replace(/^\/[a-z]{2}(-[a-z]+)?/i, `/${preferred}`));
    }
  }, [pathname, router, validLocales]);
}
