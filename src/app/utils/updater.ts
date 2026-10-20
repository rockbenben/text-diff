"use client";

import { isTauri } from "./externalLink";

// Progress of the installer download, in bytes. `total` is null when the
// server did not report a content length.
export type DownloadProgress = (downloaded: number, total: number | null) => void;

export interface PendingUpdate {
  version: string;
  currentVersion: string;
  // Fetches the installer. Only called after the user accepted the update —
  // the check itself never transfers the installer.
  download: (onProgress?: DownloadProgress) => Promise<void>;
  // Installs the downloaded update. Tauri v2's install() relaunches the app.
  install: () => Promise<void>;
}

export interface UpdateCheckResult {
  hasUpdate: boolean;
  update?: PendingUpdate;
  error?: string;
}

// Ask the update endpoint what the latest version is. This never downloads
// anything: the installer is fetched by download(), once the user accepted.
export const checkForUpdates = async (): Promise<UpdateCheckResult> => {
  const tauriEnv = await isTauri();
  if (!tauriEnv) {
    return { hasUpdate: false, error: "Not in Tauri environment" };
  }

  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();

    if (!update) {
      return { hasUpdate: false };
    }

    return {
      hasUpdate: true,
      update: {
        version: update.version,
        currentVersion: update.currentVersion,
        download: async (onProgress) => {
          let downloaded = 0;
          let total: number | null = null;
          await update.download((event) => {
            if (event.event === "Started") {
              total = event.data.contentLength ?? null;
            } else if (event.event === "Progress") {
              downloaded += event.data.chunkLength;
              onProgress?.(downloaded, total);
            }
          });
        },
        install: async () => {
          await update.install();
        },
      },
    };
  } catch (error) {
    console.error("Failed to check for updates:", error);
    return { hasUpdate: false, error: String(error) };
  }
};
