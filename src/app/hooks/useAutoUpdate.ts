"use client";

import { useEffect, useRef, useCallback } from "react";
import { message, Modal } from "antd";
import { checkForUpdates, UpdateCheckResult } from "@/app/utils/updater";
import { isTauri } from "@/app/utils/externalLink";

const SKIPPED_VERSION_KEY = "textdiff_skipped_version";

interface UseAutoUpdateOptions {
  checkOnStartup?: boolean;
  startupDelay?: number;
  checkInterval?: number;
  silentMode?: boolean;
}

export const useAutoUpdate = (options: UseAutoUpdateOptions = {}) => {
  const { checkOnStartup = true, startupDelay = 3000, checkInterval = 24 * 60 * 60 * 1000, silentMode = true } = options;

  const hasCheckedOnStartup = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastCheckTime = useRef<number>(0);

  const isVersionSkipped = useCallback((version: string) => {
    try {
      return localStorage.getItem(SKIPPED_VERSION_KEY) === version;
    } catch {
      return false;
    }
  }, []);

  const skipVersion = useCallback((version: string) => {
    try {
      localStorage.setItem(SKIPPED_VERSION_KEY, version);
    } catch {
      // ignore
    }
  }, []);

  const showInstallConfirm = useCallback(
    (result: UpdateCheckResult) => {
      Modal.confirm({
        title: "Update Available",
        content: `Version ${result.version} has been downloaded. Install now and restart?`,
        okText: "Install Now",
        cancelText: "Skip This Version",
        centered: true,
        onOk: async () => {
          if (!result.install) return;
          message.loading({ content: "Installing update...", key: "installing", duration: 0 });
          try {
            await result.install();
          } catch (error) {
            message.destroy("installing");
            message.error("Installation failed, please try again later");
            console.error("Install failed:", error);
          }
        },
        onCancel: () => {
          if (result.version) {
            skipVersion(result.version);
            message.info({
              content: `Version ${result.version} skipped. You won't be reminded again for this version.`,
              duration: 3,
            });
          }
        },
      });
    },
    [skipVersion]
  );

  const performUpdateCheck = useCallback(
    async (isStartupCheck = false) => {
      if (!(await isTauri())) return;

      // Throttle: never run more than once per hour.
      const now = Date.now();
      if (now - lastCheckTime.current < 60 * 60 * 1000) return;
      lastCheckTime.current = now;

      try {
        console.log(`Auto update check ${isStartupCheck ? "(startup)" : "(scheduled)"}...`);
        const result = await checkForUpdates();

        if (result.hasUpdate && result.downloaded && result.version) {
          if (isVersionSkipped(result.version)) {
            console.log(`Version ${result.version} was skipped by user`);
            return;
          }
          message.success({ content: `🎉 Version ${result.version} downloaded!`, duration: 3, key: "auto-update" });
          showInstallConfirm(result);
        } else if (!result.hasUpdate) {
          console.log(`Auto update: already on latest version${result.error ? ` (${result.error})` : ""}`);
          if (!silentMode && !isStartupCheck) {
            message.info({ content: "✅ You're on the latest version", duration: 2, key: "auto-update" });
          }
        }
      } catch (error) {
        console.error("Auto update check failed:", error);
        if (!isStartupCheck && !silentMode) {
          message.warning({ content: "⚠️ Update check failed, please try again later", duration: 3, key: "auto-update" });
        }
      }
    },
    [silentMode, showInstallConfirm, isVersionSkipped]
  );

  // Startup check (after a short delay so the UI settles first).
  useEffect(() => {
    if (!checkOnStartup || hasCheckedOnStartup.current) return;
    const timer = setTimeout(() => {
      hasCheckedOnStartup.current = true;
      performUpdateCheck(true);
    }, startupDelay);
    return () => clearTimeout(timer);
  }, [checkOnStartup, startupDelay, performUpdateCheck]);

  // Periodic re-check.
  useEffect(() => {
    if (!checkInterval || checkInterval <= 0) return;
    intervalRef.current = setInterval(() => performUpdateCheck(false), checkInterval);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [checkInterval, performUpdateCheck]);
};
