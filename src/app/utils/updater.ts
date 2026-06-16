"use client";

import { isTauri } from "./externalLink";

export interface UpdateCheckResult {
  hasUpdate: boolean;
  version?: string;
  downloaded?: boolean;
  install?: () => Promise<void>; // call after the user confirms
  error?: string;
}

// Check for updates, downloading automatically but deferring install until the
// user confirms.
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

    console.log("Update available:", update.version);

    let downloaded = 0;
    let contentLength = 0;
    await update.download((event) => {
      switch (event.event) {
        case "Started":
          contentLength = event.data.contentLength || 0;
          console.log(`Started downloading ${contentLength} bytes`);
          break;
        case "Progress":
          downloaded += event.data.chunkLength;
          console.log(`Downloaded ${downloaded} / ${contentLength}`);
          break;
        case "Finished":
          console.log("Download finished");
          break;
      }
    });

    return {
      hasUpdate: true,
      version: update.version,
      downloaded: true,
      // Tauri v2's install() triggers the relaunch.
      install: async () => {
        await update.install();
      },
    };
  } catch (error) {
    console.error("Failed to check for updates:", error);
    return { hasUpdate: false, error: String(error) };
  }
};

// Current app version (or "Web Version" outside Tauri).
export const getAppVersion = async (): Promise<string> => {
  const tauriEnv = await isTauri();
  if (!tauriEnv) {
    return "Web Version";
  }

  try {
    const { getVersion } = await import("@tauri-apps/api/app");
    return await getVersion();
  } catch (error) {
    console.error("Failed to get app version:", error);
    return "Unknown";
  }
};
