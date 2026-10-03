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
        <CheckOutlined className={styles.okIcon} aria-hidden />
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

  // Every change kind shows WHAT changed, not just where: mod shows before→after,
  // del/add show the removed/added line as a single chip (blank lines carry no
  // content, so their chip is skipped — the location line already says it all).
  const delLine = first.before?.trim();
  const addLine = first.after?.trim();
  const chips =
    first.kind === "mod" && first.before !== undefined ? (
      // The CHAIN is pinned ltr so it keeps reading before→after. The flex row
      // mirrors on its own (before-chip ends up rightmost) but the arrow does not
      // follow it — measured on /ar, U+2192 sitting between an Arabic value and a
      // Latin one still renders →, so the mirrored row read "new → old".
      // The individual VALUES get dir=auto (isolate on a span) — an Arabic value
      // then renders and ellipsizes on its own side instead of being force-flushed
      // left. Pinning the chain but not the values is the whole point.
      <span dir="ltr" className={styles.bannerChips}>
        <span dir="auto" className={`${styles.chip} ${styles.chipDel}`} title={first.before}>{first.before}</span>
        <span className={styles.arrow}>→</span>
        <span dir="auto" className={`${styles.chip} ${styles.chipAdd}`} title={first.after}>{first.after}</span>
      </span>
    ) : first.kind === "del" && delLine ? (
      <span className={styles.bannerChips}>
        <span dir="auto" className={`${styles.chip} ${styles.chipDel}`} title={first.before}>{delLine}</span>
      </span>
    ) : first.kind === "add" && addLine ? (
      <span className={styles.bannerChips}>
        <span dir="auto" className={`${styles.chip} ${styles.chipAdd}`} title={first.after}>{addLine}</span>
      </span>
    ) : null;

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
          {chips}
        </div>
      </div>
      {/* aria-hidden on the chevron: antd's Icon ships role="img" +
          aria-label="right", and this banner is a role="button" with no
          aria-label of its own — so its accessible name is read from its
          contents and the English glyph name leaked into it (and named the
          wrong way round once the chevron mirrors for RTL). */}
      <span className={styles.jump}>{t("jump")} <RightOutlined aria-hidden /></span>
    </div>
  );
};

export default FirstDiffBanner;
