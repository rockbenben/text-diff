"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isTauriRuntime } from "@/app/utils/externalLink";

const KEY = "textdiff_preferred_language";

const read = (): string | null => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};
const save = (locale: string) => {
  try {
    localStorage.setItem(KEY, locale);
  } catch {
    /* ignore */
  }
};

const localeOfPath = (pathname: string): string | null => pathname.match(/^\/([a-z]{2}(-[a-z]+)?)/i)?.[1] ?? null;

// Best-effort map of the webview's language to a supported app locale.
const systemLocale = (): string => {
  const s = (typeof navigator !== "undefined" && navigator.language) || "en";
  if (s.startsWith("zh")) return /TW|HK|Hant/i.test(s) ? "zh-hant" : "zh";
  return s.split("-")[0];
};

// Desktop-only: remember the user's language across launches.
//
// On the first load of an app session it soft-redirects to the saved locale (or,
// on a fresh install, the detected system locale); afterwards it records whatever
// locale the user switches to. Three things keep it from fighting the language
// switcher the way the earlier version did:
//   1. SOFT navigation (router.replace) — never a hard reload, so the hook is never
//      remounted by a switch and the startup redirect can't re-fire mid-session.
//   2. Run-once startup (startedRef) — the redirect is evaluated a single time.
//   3. Skip the first persist — so the entry locale (/en/) isn't written over the
//      saved preference before the startup redirect lands.
// Gated to Tauri so the web build (and its SEO) is completely unaffected.
export function useLanguagePreference(validLocales: string[]) {
  const pathname = usePathname();
  const router = useRouter();
  const startedRef = useRef(false);
  const skipFirstPersist = useRef(true);

  useEffect(() => {
    if (startedRef.current || !isTauriRuntime()) return;
    const current = localeOfPath(pathname);
    if (!current) return; // wait for a locale-bearing path
    startedRef.current = true;

    let preferred = read();
    if (!preferred) {
      const sys = systemLocale();
      if (validLocales.includes(sys)) {
        preferred = sys;
        save(sys);
      }
    }
    if (preferred && validLocales.includes(preferred) && preferred !== current) {
      router.replace(pathname.replace(/^\/[a-z]{2}(-[a-z]+)?/i, `/${preferred}`));
    }
  }, [pathname, router, validLocales]);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    if (skipFirstPersist.current) {
      skipFirstPersist.current = false;
      return;
    }
    const current = localeOfPath(pathname);
    if (current && validLocales.includes(current)) save(current);
  }, [pathname, validLocales]);
}
