"use client";

import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Alert, App, Button, Checkbox, Divider, Segmented, Select, Space, Tooltip, Typography, Upload } from "antd";
import { SwapOutlined, UpOutlined, DownOutlined, ClearOutlined, CopyOutlined, DownloadOutlined, FullscreenOutlined, FullscreenExitOutlined } from "@ant-design/icons";
import { useTranslations } from "next-intl";
import { createPatch } from "diff";
import { decodeFileBytes, normalizeNewlines, downloadFile, getFileTypePresetConfig } from "@/app/utils";
import { useLocalStorage } from "@/app/hooks/useLocalStorage";
import { useCopyToClipboard } from "@/app/hooks/useCopyToClipboard";
import { useIsMobile } from "@/app/hooks/useIsMobile";
import { computeDiff, detectFormat } from "./diffEngine";
import type { FormatKind } from "./formats";
import DiffPane, { type DiffPaneHandle } from "./DiffPane";
import FirstDiffBanner from "./FirstDiffBanner";
import CodeInput from "./CodeInput";
import styles from "./textDiff.module.css";

const ENCODINGS = ["utf-8", "gbk", "big5", "utf-16le"] as const;
const FORMATS: FormatKind[] = ["plain", "csv", "tsv", "ini", "json"];
// Shared richText preset (single source of truth in fileTypes.ts) + the text/*
// MIME wildcard so any text file passes the OS dialog's default filter (user can
// still switch to "all files").
const ACCEPT = `${getFileTypePresetConfig("richText").accept},text/*`;

interface SideState { text: string; bytes: ArrayBuffer | null; filename: string | null; encoding: string; }
const emptySide: SideState = { text: "", bytes: null, filename: null, encoding: "utf-8" };

const countLines = (s: string) => (s === "" ? 0 : s.split("\n").length);

const TextDiff = () => {
  const t = useTranslations("TextDiff");
  const { message } = App.useApp();
  const isMobile = useIsMobile();

  const [a, setA] = useState<SideState>(emptySide);
  const [b, setB] = useState<SideState>(emptySide);
  const [formatOverride, setFormatOverride] = useLocalStorage<FormatKind | "auto">("text-diff-format", "auto");
  const [ignoreWhitespace, setIgnoreWhitespace] = useLocalStorage("text-diff-ignoreWhitespace", false);
  const [ignoreCase, setIgnoreCase] = useLocalStorage("text-diff-ignoreCase", false);
  const [charLevel, setCharLevel] = useLocalStorage("text-diff-charLevel", false);
  const [diffOnly, setDiffOnly] = useLocalStorage("text-diff-diffOnly", true);
  const [context, setContext] = useLocalStorage("text-diff-context", 1);
  const [view, setView] = useLocalStorage<"split" | "unified">("text-diff-view", "split");
  const [hunkIdx, setHunkIdx] = useState(0);
  const [forceCompute, setForceCompute] = useState(false); // user opted into a full diff after a timeout
  const [maximized, setMaximized] = useState(false); // fullscreen the diff for large-screen comparison
  const { copyToClipboard } = useCopyToClipboard();

  const paneRef = useRef<DiffPaneHandle>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  // Per-side load sequence: a file decode is async (jschardet lazy-load), so a
  // stale onload could otherwise clobber text the user typed (or a newer file)
  // while it was decoding. Any mutation bumps the side's seq to supersede it.
  const loadSeq = useRef<{ a: number; b: number }>({ a: 0, b: 0 });

  // useDeferredValue keeps typing responsive: the textarea updates immediately,
  // then the heavy diff recomputes at lower priority and is abandoned if the
  // user keeps typing — no per-keystroke O(n×m) jank.
  const aText = useDeferredValue(a.text);
  const bText = useDeferredValue(b.text);
  const bothPresent = aText.trim() !== "" && bText.trim() !== "";

  const format: FormatKind = useMemo(
    () => (formatOverride !== "auto" ? formatOverride : detectFormat(a.filename ?? b.filename, aText || bText)),
    [formatOverride, a.filename, b.filename, aText, bText],
  );

  // Any content change re-arms the timeout guard: a forced full compare applies
  // only to the inputs it was requested for, not to whatever is typed next.
  // (Render-time reset per React's "adjust state when inputs change" pattern,
  // same as prevResult below — guarded so it can't loop.)
  const [prevInputs, setPrevInputs] = useState({ a: aText, b: bText });
  const inputsChanged = prevInputs.a !== aText || prevInputs.b !== bText;
  if (inputsChanged) {
    setPrevInputs({ a: aText, b: bText });
    setForceCompute(false);
  }
  // Apply the reset THIS render: `forceCompute` state lags by one render, so
  // without this an edit after a force would run one full (slow) compare before
  // the timeout guard re-arms on the next render.
  const effectiveForce = forceCompute && !inputsChanged;

  // The diff is hard-bounded by DIFF_TIMEOUT_MS: if the two sides are too
  // dissimilar to finish in time it returns `aborted`. A forced run re-computes
  // with no timeout for a full, possibly slow, comparison the user asked for.
  const computed = useMemo(
    () =>
      bothPresent ? computeDiff(aText, bText, { format, ignoreWhitespace, ignoreCase, charLevel }, effectiveForce) : null,
    [bothPresent, effectiveForce, aText, bText, format, ignoreWhitespace, ignoreCase, charLevel],
  );
  // On timeout show only the warning — no diff. `result` is null'd so every diff
  // surface (banner, toolbar, readout, pane) skips, leaving the warning + force.
  const aborted = !!computed?.aborted;
  const result = aborted ? null : computed;

  // When the diff recomputes (text/options changed), the old block index is
  // stale — reset it so the "i / n" counter can't show an impossible i > n.
  // Navigation clicks keep the same memoized `result`, so they don't reset.
  const [prevResult, setPrevResult] = useState(result);
  if (prevResult !== result) {
    setPrevResult(result);
    setHunkIdx(0);
  }

  const loadFile = (side: "a" | "b", file: File) => {
    const seq = ++loadSeq.current[side];
    const reader = new FileReader();
    reader.onload = async (e) => {
      const buffer = e.target?.result as ArrayBuffer;
      try {
        const text = normalizeNewlines(await decodeFileBytes(buffer));
        if (seq !== loadSeq.current[side]) return; // superseded by a newer load or a user edit
        const next: SideState = { text, bytes: buffer, filename: file.name, encoding: "utf-8" };
        (side === "a" ? setA : setB)(next);
        if (/�/.test(text)) message.warning(t("notTextFile"));
      } catch {
        if (seq !== loadSeq.current[side]) return;
        // 解码失败【仍然留住 bytes】。右上角那个编码选择器以 s.bytes 为渲染
        // 条件,而 changeEncoding 只需要 bytes —— 它正是为「自动识别不出来的
        // 文件」存在的。丢掉 bytes 等于把唯一的补救入口一起关掉:用户既看不到
        // 内容,也没法手动指定编码,这个文件就彻底 diff 不了了。
        // (decodeFileBytes 对识别不出的编码抛出而非回退成 U+FFFD 之后,这条
        //  分支从「几乎走不到」变成了这类文件的常规路径。)
        (side === "a" ? setA : setB)({ text: "", bytes: buffer, filename: file.name, encoding: "utf-8" });
        message.error(t("notTextFile"));
      }
    };
    reader.readAsArrayBuffer(file);
    return false; // suppress antd auto-upload
  };

  const changeEncoding = (side: "a" | "b", encoding: string) => {
    const s = side === "a" ? a : b;
    if (!s.bytes) return;
    try {
      const text = normalizeNewlines(new TextDecoder(encoding).decode(s.bytes));
      (side === "a" ? setA : setB)({ ...s, encoding, text });
    } catch {
      message.error(t("notTextFile"));
    }
  };

  const editText = (side: "a" | "b", text: string) => {
    loadSeq.current[side]++; // cancel any in-flight file decode for this side
    (side === "a" ? setA : setB)((prev) => ({ ...prev, text, bytes: null, filename: null }));
  };

  const swap = () => { loadSeq.current.a++; loadSeq.current.b++; setA(b); setB(a); };
  const clearAll = () => { loadSeq.current.a++; loadSeq.current.b++; setA(emptySide); setB(emptySide); setHunkIdx(0); setForceCompute(false); setMaximized(false); };

  // While maximized: Esc exits, and the page body is scroll-locked behind the
  // fixed overlay so a stray wheel/trackpad scroll can't move the hidden page.
  useEffect(() => {
    if (!maximized) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMaximized(false); };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prevOverflow; };
  }, [maximized]);

  // On entering fullscreen, move focus into the overlay — the page behind is inert,
  // so focus must not stay on a now-unreachable control. No scroll handling needed:
  // the DiffPane sits in a stable position (never remounts across the toggle), so it
  // simply keeps its current scroll — entering fullscreen doesn't jump the view.
  useEffect(() => {
    if (maximized) overlayRef.current?.focus();
  }, [maximized]);

  // Export the comparison as a standard unified diff (.patch) — pasteable into
  // `git apply`, review tools, etc. Header names fall back to A/B when typed in.
  const exportPatch = () => {
    // Export is an explicit user action — let it run to completion even on a large
    // raw diff (slow is acceptable when the user clicked it), rather than failing.
    const patch = createPatch(b.filename ?? "diff", a.text, b.text, a.filename ?? t("sideA"), b.filename ?? t("sideB"));
    void downloadFile(patch, (b.filename ?? "text") + ".patch");
    message.success(t("exportDone"));
  };

  const gotoHunk = (idx: number) => {
    if (!result || result.hunks.length === 0) return;
    const clamped = (idx + result.hunks.length) % result.hunks.length;
    setHunkIdx(clamped);
    paneRef.current?.scrollToHunk(result.hunks[clamped].start);
  };

  // Row-click select: make that block current WITHOUT scroll-centering — the row
  // the user clicked is already in view, so jumping it to center would be jarring.
  const selectHunk = (idx: number) => {
    if (!result || result.hunks.length === 0) return;
    setHunkIdx((idx + result.hunks.length) % result.hunks.length);
  };

  // Comparison readout, derived purely from the diff rows: per-side line totals
  // (A has same+mod+del lines, B has same+mod+add) and a line-level similarity
  // (matching lines / total compared units). No engine change — keeps the
  // diffEngine stats contract (and its tests) untouched.
  const compare = useMemo(() => {
    if (!result) return null;
    const { mods, adds, dels } = result.stats;
    const total = result.rows.length;
    const same = total - (mods + adds + dels);
    const aLines = result.rows.filter((r) => r.aLine !== undefined).length;
    const bLines = result.rows.filter((r) => r.bLine !== undefined).length;
    const similarity = total ? Math.round((same / total) * 100) : 100;
    return { aLines, bLines, similarity };
  }, [result]);

  // The currently-navigated hunk — highlighted in DiffPane so prev/next gives
  // visible feedback even when the (folded) diff fits the viewport and nothing
  // actually scrolls.
  const activeHunk = result && result.hunks.length ? result.hunks[Math.min(hunkIdx, result.hunks.length - 1)] : undefined;

  const renderSide = (side: "a" | "b") => {
    const s = side === "a" ? a : b;
    return (
      <div key={side} className={styles.pane}>
        <div className={styles.paneHead}>
          <span className={styles.paneTag}>
            <i aria-hidden />
            {side === "a" ? t("sideA") : t("sideB")}
          </span>
          <span className={styles.paneFile} title={s.filename ?? t("manualInput")}>
            {s.filename ?? t("manualInput")}
          </span>
          <span className={styles.paneTools}>
            {/* Encoding only matters for decoding uploaded bytes — surface it
                contextually once a file is loaded, not as a dead disabled
                control that clutters the manual-input default state. */}
            {s.bytes && (
              <Select
                size="small" value={s.encoding} style={{ width: 96 }}
                onChange={(enc) => changeEncoding(side, enc)}
                options={ENCODINGS.map((enc) => ({ value: enc, label: enc }))} />
            )}
            <Upload accept={ACCEPT} beforeUpload={(f) => loadFile(side, f)} showUploadList={false} maxCount={1}>
              <Button size="small" type="text">{t("fill")}</Button>
            </Upload>
          </span>
        </div>
        <CodeInput
          value={s.text} onChange={(text) => editText(side, text)}
          onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); }}
          onDrop={(e) => { const f = e.dataTransfer.files?.[0]; if (f) { e.preventDefault(); loadFile(side, f); } }}
          placeholder={t("pasteHere")} minRows={10} maxRows={16} />
      </div>
    );
  };

  // Readout + DiffPane are rendered in exactly ONE place at a time (inline, or
  // inside the fullscreen overlay) so the single paneRef/virtualizer is never
  // duplicated. The overlay reuses these same elements.
  const readout = result && (
    <div className={styles.readout}>
      {compare && (
        <span className={styles.metric}>
          <span className={styles.metricLabel}>{t("similarityLabel")}</span>
          <span className={styles.metricBig} style={{ color: compare.similarity === 100 ? "var(--td-add)" : "var(--td-text)" }}>{compare.similarity}%</span>
        </span>
      )}
      <Tooltip title={t("stats", { count: result.stats.mods + result.stats.adds + result.stats.dels, mods: result.stats.mods, adds: result.stats.adds, dels: result.stats.dels })}>
        <span className={styles.counts}>
          <span className={styles.cMod}>~{result.stats.mods}</span>
          <span className={styles.cAdd}>+{result.stats.adds}</span>
          <span className={styles.cDel}>−{result.stats.dels}</span>
        </span>
      </Tooltip>
      {compare && <span className={styles.totals}>{t("linesAB", { a: compare.aLines, b: compare.bLines })}</span>}
      {format === "json" && (
        <Typography.Text type="warning" style={{ fontSize: 12 }}>
          {t("jsonAsText")}
        </Typography.Text>
      )}
    </div>
  );
  const diffPane = result && (
    <DiffPane ref={paneRef} result={result} diffOnly={diffOnly} context={context} view={view} activeHunk={activeHunk} onSelectHunk={gotoHunk} onPickHunk={selectHunk} maximized={maximized} />
  );

  return (
    <div className={styles.surface}>
      {/* Background goes inert while maximized so Tab/AT can't reach the controls
          hidden behind the fixed overlay. */}
      <div inert={maximized || undefined}>
      <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
        {/* Inputs first — you type/drop on top, results flow below. */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
          {renderSide("a")}
          {renderSide("b")}
        </div>

        {aborted && (
          <Alert
            type="warning"
            showIcon
            title={t("largeWarning")}
            description={t("linesAB", { a: countLines(aText), b: countLines(bText) })}
            action={
              <Button size="small" onClick={() => setForceCompute(true)}>
                {t("computeAnyway")}
              </Button>
            }
          />
        )}

        {result && <FirstDiffBanner first={result.first} onJump={() => gotoHunk(0)} />}

        {result && (
          <div className={styles.toolbar}>
            {/* View — how the diff is shown */}
            <span className={styles.cluster}>
              <Segmented<"split" | "unified">
                value={view}
                onChange={setView}
                options={[
                  { value: "split", label: t("viewSplit") },
                  { value: "unified", label: t("viewUnified") },
                ]}
              />
              <Checkbox checked={diffOnly} onChange={(e) => setDiffOnly(e.target.checked)}>{t("diffOnly")}</Checkbox>
              <Tooltip title={t("contextTooltip")}>
                <Select<number>
                  size="small" value={context} disabled={!diffOnly} onChange={setContext} style={{ width: 120 }}
                  options={[0, 1, 3, 5, 10].map((n) => ({ value: n, label: n === 0 ? t("contextNone") : t("contextLines", { n }) }))} />
              </Tooltip>
            </span>

            <Divider orientation="vertical" />

            {/* Compare — what gets compared */}
            <span className={styles.cluster}>
              <Select<FormatKind | "auto">
                size="small" value={formatOverride} onChange={setFormatOverride} style={{ width: 130 }}
                options={[{ value: "auto", label: `${t("detectedAs")}: ${t(("format" + format[0].toUpperCase() + format.slice(1)) as never)}` },
                  ...FORMATS.map((fmt) => ({ value: fmt, label: t(("format" + fmt[0].toUpperCase() + fmt.slice(1)) as never) }))]} />
              <Checkbox checked={charLevel} onChange={(e) => setCharLevel(e.target.checked)}>{t("charLevel")}</Checkbox>
              <Checkbox checked={ignoreWhitespace} onChange={(e) => setIgnoreWhitespace(e.target.checked)}>{t("ignoreWhitespace")}</Checkbox>
              <Checkbox checked={ignoreCase} onChange={(e) => setIgnoreCase(e.target.checked)}>{t("ignoreCase")}</Checkbox>
            </span>

            <Divider orientation="vertical" />

            {/* Navigate */}
            <Space.Compact>
              <Button icon={<UpOutlined />} title={t("prev")} aria-label={t("prev")} onClick={() => gotoHunk(hunkIdx - 1)} disabled={!result.hunks.length} />
              <Button style={{ pointerEvents: "none", fontFamily: "var(--td-mono)" }}>
                {result.hunks.length ? t("blockNav", { i: hunkIdx + 1, n: result.hunks.length }) : "0 / 0"}
              </Button>
              <Button icon={<DownOutlined />} title={t("next")} aria-label={t("next")} onClick={() => gotoHunk(hunkIdx + 1)} disabled={!result.hunks.length} />
            </Space.Compact>

            <Divider orientation="vertical" />

            {/* Actions */}
            <span className={styles.cluster}>
              <Button icon={<FullscreenOutlined />} onClick={() => setMaximized(true)}>{t("maximize")}</Button>
              <Button icon={<SwapOutlined />} onClick={swap}>{t("swap")}</Button>
              <Space.Compact>
                <Button icon={<CopyOutlined />} onClick={() => copyToClipboard(a.text, t("sideA"))}>{t("copyA")}</Button>
                <Button icon={<CopyOutlined />} onClick={() => copyToClipboard(b.text, t("sideB"))}>{t("copyB")}</Button>
                <Tooltip title={t("exportDiffTooltip")}>
                  <Button icon={<DownloadOutlined />} onClick={exportPatch}>{t("exportDiff")}</Button>
                </Tooltip>
              </Space.Compact>
              <Button icon={<ClearOutlined />} danger onClick={clearAll}>{t("clear")}</Button>
            </span>
          </div>
        )}

      </Space>
      </div>

      {/* Result zone — a STABLE sibling rendered in the SAME position whether inline
          or maximized, so the DiffPane never remounts and simply keeps its scroll
          across the toggle (no jump-to-top). Lives OUTSIDE the inert wrapper so it
          stays interactive as the fullscreen overlay. */}
      {result && (
        <div
          ref={overlayRef}
          className={maximized ? styles.overlay : styles.resultZone}
          {...(maximized ? { tabIndex: -1, role: "dialog", "aria-modal": true, "aria-label": t("maximize") } : {})}>
          {maximized ? (
            <div className={styles.overlayHead}>
              {readout}
              <span className={styles.overlayControls}>
                <Segmented<"split" | "unified">
                  value={view}
                  onChange={setView}
                  options={[
                    { value: "split", label: t("viewSplit") },
                    { value: "unified", label: t("viewUnified") },
                  ]}
                />
                <Checkbox checked={diffOnly} onChange={(e) => setDiffOnly(e.target.checked)}>{t("diffOnly")}</Checkbox>
                <Space.Compact>
                  <Button icon={<UpOutlined />} title={t("prev")} aria-label={t("prev")} onClick={() => gotoHunk(hunkIdx - 1)} disabled={!result.hunks.length} />
                  <Button style={{ pointerEvents: "none", fontFamily: "var(--td-mono)" }}>
                    {result.hunks.length ? t("blockNav", { i: hunkIdx + 1, n: result.hunks.length }) : "0 / 0"}
                  </Button>
                  <Button icon={<DownOutlined />} title={t("next")} aria-label={t("next")} onClick={() => gotoHunk(hunkIdx + 1)} disabled={!result.hunks.length} />
                </Space.Compact>
                <Button icon={<FullscreenExitOutlined />} onClick={() => setMaximized(false)}>{t("exitMaximize")}</Button>
              </span>
            </div>
          ) : (
            readout
          )}
          {diffPane}
        </div>
      )}
    </div>
  );
};

export default TextDiff;
