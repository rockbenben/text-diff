"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { App, Button, Flex } from "antd";
import { useTranslations } from "next-intl";
import { checkForUpdates, PendingUpdate } from "@/app/utils/updater";
import { isTauri } from "@/app/utils/externalLink";
import { useLocalStorage } from "@/app/hooks/useLocalStorage";

// The version the user chose to skip. Remembered across launches.
const SKIPPED_VERSION_KEY = "textdiff_skipped_version";
// Opt-in for the automatic check. While it is off the app never asks the
// update endpoint anything on its own.
const AUTO_CHECK_KEY = "textdiff_auto_update";
const TOAST_KEY = "update";

interface UseAutoUpdateOptions {
  startupDelay?: number;
  checkInterval?: number;
}

// The opt-in flag, shared by the automatic check and the toggle that turns it
// on. It goes through the app's own localStorage wrapper, so every hook
// instance in the tree reads and writes the same value.
export const useAutoUpdatePreference = () => useLocalStorage<boolean>(AUTO_CHECK_KEY, false);

const isVersionSkipped = (version: string) => {
  try {
    return localStorage.getItem(SKIPPED_VERSION_KEY) === version;
  } catch {
    return false;
  }
};

const skipVersion = (version: string) => {
  try {
    localStorage.setItem(SKIPPED_VERSION_KEY, version);
  } catch {
    // ignore
  }
};

// The "a new version is available" prompt, shared by the automatic and the
// manual check. The download only starts from the confirm handler — the
// check itself never transfers the installer.
const useUpdatePrompt = () => {
  const { modal, message } = App.useApp();
  const t = useTranslations("Update");

  return useCallback(
    (update: PendingUpdate) => {
      const instance = modal.confirm({
        title: t("availableTitle"),
        content: t("availableContent", { version: update.version }),
        // Esc / the mask / the X only dismiss this prompt — they must not
        // mark the version as skipped. Only the named button does that.
        onCancel: () => {},
        footer: (okBtn) => (
          <Flex gap={8} justify="flex-end">
            <Button onClick={() => instance.destroy()}>{t("remindLater")}</Button>
            <Button
              danger
              onClick={() => {
                skipVersion(update.version);
                instance.destroy();
                message.info(t("skipped", { version: update.version }));
              }}
            >
              {t("skipVersion")}
            </Button>
            {okBtn}
          </Flex>
        ),
        okText: t("installNow"),
        onOk: async () => {
          try {
            message.loading({ content: t("downloading"), key: TOAST_KEY, duration: 0 });
            await update.download((downloaded, total) => {
              message.loading({
                content: total
                  ? t("downloadingProgress", { percent: Math.round((downloaded / total) * 100) })
                  : t("downloading"),
                key: TOAST_KEY,
                duration: 0,
              });
            });
            message.loading({ content: t("installing"), key: TOAST_KEY, duration: 0 });
            await update.install();
            // install() relaunches the app, so this normally never runs.
            message.destroy(TOAST_KEY);
          } catch (error) {
            console.error("Update install failed:", error);
            message.destroy(TOAST_KEY);
            message.error(t("installFailed"));
          }
        },
      });
    },
    [modal, message, t]
  );
};

// The automatic check. Opt-in: while the flag is off the app makes no
// network call at all. Failures stay quiet — the user never asked for this
// check, so there is nothing they could act on.
export const useAutoUpdate = (options: UseAutoUpdateOptions = {}) => {
  const { startupDelay = 3000, checkInterval = 24 * 60 * 60 * 1000 } = options;
  const [autoCheckEnabled] = useAutoUpdatePreference();
  const promptUpdate = useUpdatePrompt();
  const hasCheckedOnStartup = useRef(false);
  const lastCheckTime = useRef(0);

  const runAutomaticCheck = useCallback(async () => {
    if (!(await isTauri())) return;

    // Throttle: never more than one automatic check per hour.
    const now = Date.now();
    if (now - lastCheckTime.current < 60 * 60 * 1000) return;
    lastCheckTime.current = now;

    try {
      const result = await checkForUpdates();
      // Nothing to report — stay quiet.
      if (!result.hasUpdate || !result.update) return;
      if (isVersionSkipped(result.update.version)) return;
      promptUpdate(result.update);
    } catch (error) {
      console.error("Auto update check failed:", error);
    }
  }, [promptUpdate]);

  // Startup check — only when the user opted in.
  useEffect(() => {
    if (!autoCheckEnabled || hasCheckedOnStartup.current) return;
    const timer = setTimeout(() => {
      hasCheckedOnStartup.current = true;
      runAutomaticCheck();
    }, startupDelay);
    return () => clearTimeout(timer);
  }, [autoCheckEnabled, startupDelay, runAutomaticCheck]);

  // Periodic re-check — same opt-in gate.
  useEffect(() => {
    if (!autoCheckEnabled || !checkInterval || checkInterval <= 0) return;
    const id = setInterval(() => {
      runAutomaticCheck();
    }, checkInterval);
    return () => clearInterval(id);
  }, [autoCheckEnabled, checkInterval, runAutomaticCheck]);
};

// The manual check. It always reports back: already up to date, a new
// version is available, or the reason the check failed.
export const useUpdateCheck = () => {
  const { message } = App.useApp();
  const t = useTranslations("Update");
  const promptUpdate = useUpdatePrompt();
  const [checking, setChecking] = useState(false);

  const checkNow = useCallback(async () => {
    if (checking) return;
    setChecking(true);
    try {
      const result = await checkForUpdates();
      if (result.error) {
        message.error(t("checkFailed", { reason: result.error }));
        return;
      }
      if (!result.hasUpdate || !result.update) {
        message.success(t("upToDate"));
        return;
      }
      // A manual check always reports a new version, even one the user
      // skipped earlier: skipping only silences the automatic reminder.
      promptUpdate(result.update);
    } catch (error) {
      console.error("Update check failed:", error);
      message.error(t("checkFailed", { reason: String(error) }));
    } finally {
      setChecking(false);
    }
  }, [checking, message, promptUpdate, t]);

  return { checkNow, checking };
};
