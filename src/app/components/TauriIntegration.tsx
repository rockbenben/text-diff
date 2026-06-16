"use client";

import { useEffect, useState } from "react";
import { useAutoUpdate } from "@/app/hooks/useAutoUpdate";
import { useLanguagePreference } from "@/app/hooks/useLanguagePreference";
import { isTauriRuntime, openExternalLink } from "@/app/utils/externalLink";
import { routing } from "@/i18n/routing";

// Mounts the desktop-only behaviors: auto-update checks and language persistence.
// Both hooks no-op outside a Tauri webview, so this is safe to render on the web.
export default function TauriIntegration() {
  useAutoUpdate();
  useLanguagePreference({ validLanguages: [...routing.locales], defaultLanguage: routing.defaultLocale });

  // Route external links to the system browser via a capture-phase delegate.
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

  // ───────────────────────── TEMP DIAGNOSTIC (remove after) ─────────────────────────
  return <DiagnosticOverlay />;
}

function DiagnosticOverlay() {
  const [log, setLog] = useState<string>("(click a test button)");
  const [probe, setProbe] = useState<string>("probing…");

  // Auto-probe: ask Tauri's asset server what it actually returns for each path,
  // and whether the HTML is the zh page or an English fallback.
  useEffect(() => {
    const one = async (p: string) => {
      try {
        const r = await fetch(p);
        const t = await r.text();
        const lang = t.match(/<html[^>]*lang="([^"]+)"/i)?.[1] ?? "?";
        const isRedirect = /REDIRECT;replace/i.test(t);
        return `${p} → ${r.status} lang=${lang}${isRedirect ? " [ROOT-REDIRECT]" : ""} len=${t.length}`;
      } catch (e) {
        return `${p} → ERR ${String(e)}`;
      }
    };
    (async () => {
      const paths = ["/zh/", "/zh/index.html", "/zh", "/en/index.html"];
      const out: string[] = [];
      for (const p of paths) out.push(await one(p));
      setProbe(out.join("\n"));
    })();
  }, []);

  const w = typeof window !== "undefined" ? window : undefined;
  const n = typeof navigator !== "undefined" ? navigator : undefined;
  const head = `DIAG isTauri=${isTauriRuntime()} INTERNALS=${!!w?.__TAURI_INTERNALS__} origin=${w?.location.origin ?? ""} path=${w?.location.pathname ?? ""} ua/Tauri=${!!n && /Tauri/i.test(n.userAgent)}`;

  const testOpenUrl = async () => {
    setLog("openUrl: trying…");
    try {
      const m = await import("@tauri-apps/plugin-opener");
      await m.openUrl("https://github.com/rockbenben/text-diff");
      setLog("openUrl: OK");
    } catch (e) {
      setLog("openUrl ERROR → " + String(e));
    }
  };
  const testWindowOpen = () => {
    try {
      const r = window.open("https://github.com/rockbenben/text-diff", "_blank");
      setLog("window.open returned: " + String(r));
    } catch (e) {
      setLog("window.open ERROR → " + String(e));
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 999999,
        background: "#000",
        color: "#3fd17a",
        font: "11px/1.5 monospace",
        padding: "8px 10px",
        whiteSpace: "pre-wrap",
        wordBreak: "break-all",
        borderTop: "1px solid #3fd17a",
        maxHeight: "45vh",
        overflow: "auto",
      }}>
      {head}
      {"\n--- asset server probe ---\n"}
      {probe}
      <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={testOpenUrl} style={btn}>test openUrl</button>
        <button onClick={testWindowOpen} style={btn}>test window.open</button>
        <span style={{ color: "#fff" }}>{log}</span>
      </div>
    </div>
  );
}

const btn: React.CSSProperties = {
  background: "#111",
  color: "#3fd17a",
  border: "1px solid #3fd17a",
  padding: "3px 8px",
  cursor: "pointer",
  font: "11px monospace",
};
