"use client";

import { useEffect, useState } from "react";
import { useAutoUpdate } from "@/app/hooks/useAutoUpdate";
import { useLanguagePreference } from "@/app/hooks/useLanguagePreference";
import { isTauriRuntime } from "@/app/utils/externalLink";
import { routing } from "@/i18n/routing";

export default function TauriIntegration() {
  useAutoUpdate();
  useLanguagePreference({ validLanguages: [...routing.locales], defaultLanguage: routing.defaultLocale });

  // External links → system browser. DIAGNOSTIC: call openUrl directly and alert
  // the error so we capture WHY it isn't opening (no need to click a test button).
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
          const m = await import("@tauri-apps/plugin-opener");
          await m.openUrl(url.href);
        } catch (err) {
          alert("openUrl FAILED:\n" + String(err));
        }
      })();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // ───────────────────────── TEMP DIAGNOSTIC (remove after) ─────────────────────────
  return <DiagnosticOverlay />;
}

function DiagnosticOverlay() {
  const [log, setLog] = useState<string>("(switch a language to test; click a link for openUrl error)");
  const w = typeof window !== "undefined" ? window : undefined;
  const head = `DIAG isTauri=${isTauriRuntime()} path=${w?.location.pathname ?? ""}`;

  const testOpenUrl = async () => {
    try {
      const m = await import("@tauri-apps/plugin-opener");
      await m.openUrl("https://github.com/rockbenben/text-diff");
      setLog("openUrl: OK");
    } catch (e) {
      setLog("openUrl ERROR → " + String(e));
    }
  };
  const testWindowOpen = () => setLog("window.open returned: " + String(window.open("https://github.com/rockbenben/text-diff", "_blank")));

  return (
    <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 999999, background: "#000", color: "#3fd17a", font: "11px/1.5 monospace", padding: "6px 10px", whiteSpace: "pre-wrap", wordBreak: "break-all", borderTop: "1px solid #3fd17a" }}>
      {head}
      <div style={{ marginTop: 4, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={testOpenUrl} style={btn}>test openUrl</button>
        <button onClick={testWindowOpen} style={btn}>test window.open</button>
        <span style={{ color: "#fff" }}>{log}</span>
      </div>
    </div>
  );
}

const btn: React.CSSProperties = { background: "#111", color: "#3fd17a", border: "1px solid #3fd17a", padding: "3px 8px", cursor: "pointer", font: "11px monospace" };
