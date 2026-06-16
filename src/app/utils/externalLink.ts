// Tauri injects these globals into the webview; declare them for type-safety.
declare global {
  interface Window {
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
  }
}

// Whether we're running inside a Tauri webview. Detect via runtime globals / UA
// only — never probe with a dynamic import, since @tauri-apps/api loads fine in a
// plain browser but `invoke` throws at call time when the host isn't Tauri.
// Synchronous so callers can branch during a click handler without awaiting.
export const isTauriRuntime = (): boolean => {
  if (typeof window === "undefined") return false;
  if (window.__TAURI_INTERNALS__) return true; // Tauri v2
  if (window.__TAURI__) return true; // Tauri v1
  if (typeof navigator !== "undefined" && navigator.userAgent.includes("Tauri")) return true;
  return false;
};

export const isTauri = async (): Promise<boolean> => isTauriRuntime();

// Open a URL in the user's real browser. In Tauri the opener plugin is used so the
// link doesn't hijack the app's own webview; on the web we fall back to window.open.
export const openExternalLink = async (url: string) => {
  if (isTauriRuntime()) {
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(url);
      return;
    } catch (error) {
      console.error("Failed to open external link via Tauri opener:", error);
      // fall through to window.open
    }
  }

  window.open(url, "_blank", "noopener,noreferrer");
};
