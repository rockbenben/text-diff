import React from "react";

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
export const isTauri = async (): Promise<boolean> => {
  if (typeof window === "undefined") return false;
  if (window.__TAURI_INTERNALS__) return true; // Tauri v2
  if (window.__TAURI__) return true; // Tauri v1
  if (typeof navigator !== "undefined" && navigator.userAgent.includes("Tauri")) return true;
  return false;
};

// Open a URL in the user's real browser. In Tauri the shell plugin is used so the
// link doesn't hijack the app's own webview; in a browser we fall back to window.open.
export const openExternalLink = async (url: string) => {
  const tauriEnv = await isTauri();

  if (tauriEnv) {
    try {
      const { open } = await import("@tauri-apps/plugin-shell");
      await open(url);
      return;
    } catch (error) {
      console.error("Failed to open external link via Tauri shell:", error);
      // fall through to window.open
    }
  }

  window.open(url, "_blank", "noopener,noreferrer");
};

export interface ExternalLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
}

// Anchor that routes clicks through openExternalLink so it behaves correctly in
// both the desktop app and the browser.
export const ExternalLink: React.FC<ExternalLinkProps> = ({ href, children, className }) => {
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    openExternalLink(href);
  };

  return (
    <a href={href} onClick={handleClick} className={className}>
      {children}
    </a>
  );
};
