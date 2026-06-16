"use client";

import React from "react";
import { RightOutlined, CheckOutlined } from "@ant-design/icons";
import { useTranslations } from "next-intl";
import styles from "./textDiff.module.css";
import type { FirstDiff } from "./diffEngine";

interface Props {
  first: FirstDiff;
  /** Scroll the diff to the first difference. */
  onJump: () => void;
}

/** The signature one-line locator: "line N, field M differs" + before→after chips,
 *  click to jump. Calm success state when the two texts are identical. */
const FirstDiffBanner = ({ first, onJump }: Props) => {
  const t = useTranslations("TextDiff");

  if (first.kind === "same") {
    return (
      <div className={`${styles.banner} ${styles.bannerOk}`}>
        <CheckOutlined className={styles.okIcon} />
        <span className={styles.bannerMsg}>{t("identical")}</span>
      </div>
    );
  }

  let message: string;
  if (first.kind === "add") message = t("locAdd", { line: first.line });
  else if (first.kind === "del") message = t("locDel", { line: first.line });
  else if (first.field?.col !== undefined) message = t("locCsv", { line: first.line, col: first.field.col + 1, name: first.field.name ?? "" });
  else if (first.field?.name) message = t("locIni", { line: first.line, name: first.field.name });
  else message = t("locPlain", { line: first.line, char: (first.field?.charIndex ?? 0) + 1 });

  const showChips = first.kind === "mod" && first.before !== undefined;

  return (
    <div
      className={styles.banner}
      role="button"
      tabIndex={0}
      onClick={onJump}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onJump(); } }}>
      <div className={styles.bannerBody}>
        <div className={styles.bannerTag}>{t("firstDiff")}</div>
        <div className={styles.bannerMain}>
          <span className={styles.bannerMsg}>{message}</span>
          {showChips && (
            <span className={styles.bannerChips}>
              <span className={`${styles.chip} ${styles.chipDel}`} title={first.before}>{first.before}</span>
              <span className={styles.arrow}>→</span>
              <span className={`${styles.chip} ${styles.chipAdd}`} title={first.after}>{first.after}</span>
            </span>
          )}
        </div>
      </div>
      <span className={styles.jump}>{t("jump")} <RightOutlined /></span>
    </div>
  );
};

export default FirstDiffBanner;
