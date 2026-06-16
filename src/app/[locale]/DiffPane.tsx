"use client";

import React, { useImperativeHandle, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useVirtualizer } from "@tanstack/react-virtual";
import styles from "./textDiff.module.css";
import type { DiffResult, DiffRow, InlineSpan } from "./diffEngine";

interface DisplayItem { kind: "row" | "fold"; row?: DiffRow; index?: number; foldCount?: number; foldKey?: number; }

/** Collapse runs of same rows into a fold marker, keeping `context` unchanged
 *  lines above/below each change. A fold whose key is in `expanded` is rendered
 *  in full (user clicked to expand it). */
function buildDisplay(rows: DiffRow[], diffOnly: boolean, expanded: Set<number>, context: number): DisplayItem[] {
  if (!diffOnly) return rows.map((row, index) => ({ kind: "row", row, index }));
  const out: DisplayItem[] = [];
  let i = 0;
  while (i < rows.length) {
    if (rows[i].kind !== "same") {
      out.push({ kind: "row", row: rows[i], index: i });
      i++;
      continue;
    }
    let j = i;
    while (j < rows.length && rows[j].kind === "same") j++;
    const runLen = j - i;
    const head = i === 0 ? 0 : context;
    const tail = j === rows.length ? 0 : context;
    if (runLen <= head + tail || expanded.has(i)) {
      for (let k = i; k < j; k++) out.push({ kind: "row", row: rows[k], index: k });
    } else {
      for (let k = i; k < i + head; k++) out.push({ kind: "row", row: rows[k], index: k });
      out.push({ kind: "fold", foldCount: runLen - head - tail, foldKey: i });
      for (let k = j - tail; k < j; k++) out.push({ kind: "row", row: rows[k], index: k });
    }
    i = j;
  }
  return out;
}

function spans(list: InlineSpan[] | undefined, fallback: string | undefined, side: "a" | "b", first: boolean) {
  if (!list) return fallback ?? "";
  return list.map((s, idx) =>
    s.changed ? (
      <span key={idx} className={first ? styles.fragFirst : side === "a" ? styles.fragDel : styles.fragAdd}>
        {s.text}
      </span>
    ) : (
      <React.Fragment key={idx}>{s.text}</React.Fragment>
    ),
  );
}

/** One side's cell within a split-view row. Shows content on its side, a hatched gap otherwise. */
function cell(row: DiffRow, side: "a" | "b") {
  const isLeft = side === "a";
  const shows = row.kind === "same" || row.kind === "mod" || (isLeft ? row.kind === "del" : row.kind === "add");
  const ln = isLeft ? row.aLine : row.bLine;
  const text = isLeft ? row.aText : row.bText;
  const spanList = isLeft ? row.aSpans : row.bSpans;

  let cls = styles.cell;
  if (!shows) cls += ` ${styles.gap}`;
  else if (row.kind === "del") cls += ` ${styles.del}`;
  else if (row.kind === "add") cls += ` ${styles.add}`;
  else if (row.kind === "mod") cls += isLeft ? ` ${styles.modLeft}` : ` ${styles.modRight}`;
  // first-diff accent + ▶ marker lives on the left cell
  if (row.first && isLeft) cls += ` ${styles.first}`;

  return (
    <div className={cls}>
      <div className={styles.ln}>{shows ? ln : ""}</div>
      <div className={styles.tx}>{shows ? (spanList ? spans(spanList, text, side, !!row.first) : text) : ""}</div>
    </div>
  );
}

/** Unified (inline) view: a modified row becomes a deletion line followed by an
 *  addition line; same/add/del stay single. Two line-number gutters (old | new),
 *  GitHub-style, so both numbers are readable in one column. */
function unifiedLines(row: DiffRow, active: boolean): React.ReactNode {
  const line = (key: string, kind: "same" | "del" | "add", aLn: number | undefined, bLn: number | undefined, text: string | undefined, spanList: InlineSpan[] | undefined, side: "a" | "b", first: boolean) => {
    let cls = styles.urow;
    if (kind === "del") cls += ` ${styles.del}`;
    else if (kind === "add") cls += ` ${styles.add}`;
    if (first) cls += ` ${styles.first}`;
    if (active) cls += ` ${styles.current}`;
    return (
      <div key={key} className={cls}>
        <div className={styles.uln}>{aLn ?? ""}</div>
        <div className={styles.uln}>{bLn ?? ""}</div>
        <div className={styles.utx}>{spanList ? spans(spanList, text, side, first) : text}</div>
      </div>
    );
  };

  if (row.kind === "mod") {
    return (
      <>
        {line("d", "del", row.aLine, undefined, row.aText, row.aSpans, "a", !!row.first)}
        {line("a", "add", undefined, row.bLine, row.bText, row.bSpans, "b", false)}
      </>
    );
  }
  if (row.kind === "del") return line("d", "del", row.aLine, undefined, row.aText, row.aSpans, "a", !!row.first);
  if (row.kind === "add") return line("a", "add", undefined, row.bLine, row.bText, row.bSpans, "b", !!row.first);
  return line("s", "same", row.aLine, row.bLine, row.aText, undefined, "a", !!row.first);
}

export interface DiffPaneHandle {
  /** Scroll the virtualized list to the row that starts a hunk. */
  scrollToHunk: (rowIndex: number) => void;
}

interface Props {
  result: DiffResult;
  diffOnly: boolean;
  /** Unchanged context lines kept around each change when diffOnly is on. */
  context: number;
  /** Side-by-side (default) or single-column inline view. */
  view: "split" | "unified";
  /** The hunk currently targeted by prev/next — its rows get a "current" highlight. */
  activeHunk?: { start: number; end: number };
  /** Overview-ruler tick click → jump to that hunk (parent syncs the i/n counter). */
  onSelectHunk?: (hunkIndex: number) => void;
  ref?: React.Ref<DiffPaneHandle>;
}

const DiffPane = ({ result, diffOnly, context, view, activeHunk, onSelectHunk, ref }: Props) => {
  const t = useTranslations("TextDiff");
  // Folds the user has clicked to expand. Reset during render (React's
  // "adjust state when a prop changes" pattern) whenever the diff changes, since
  // row indices (the fold keys) no longer correspond to the previous result.
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [prevResult, setPrevResult] = useState(result);
  if (prevResult !== result) {
    setPrevResult(result);
    setExpanded(new Set());
  }

  const items = useMemo(() => buildDisplay(result.rows, diffOnly, expanded, context), [result.rows, diffOnly, expanded, context]);

  // rows[] index → position in the (possibly folded) display list, for scroll-to
  // and for placing overview-ruler ticks against the actual scrollable content.
  const rowToItem = useMemo(() => {
    const m = new Map<number, number>();
    items.forEach((it, i) => { if (it.kind === "row" && it.index !== undefined) m.set(it.index, i); });
    return m;
  }, [items]);

  const scrollRef = useRef<HTMLDivElement>(null);
  // React Compiler can't analyze TanStack's hook; opting this component out of
  // compilation is fine (the virtualizer manages its own memoization).
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => (view === "unified" ? 50 : 25),
    overscan: 16,
  });

  useImperativeHandle(
    ref,
    () => ({
      scrollToHunk: (rowIndex: number) => {
        const i = rowToItem.get(rowIndex);
        if (i !== undefined) virtualizer.scrollToIndex(i, { align: "center" });
      },
    }),
    [rowToItem, virtualizer],
  );

  // Overview ruler ticks: each hunk mapped to its position in the displayed item
  // list (respects folding), so a tick lines up with where it scrolls to.
  const ticks = useMemo(() => {
    const n = items.length;
    if (!n) return [];
    return result.hunks.map((h, i) => {
      const startItem = rowToItem.get(h.start) ?? 0;
      const endItem = rowToItem.get(h.end) ?? startItem;
      const kind = result.rows[h.start]?.kind;
      return {
        i,
        top: (startItem / n) * 100,
        height: ((endItem - startItem + 1) / n) * 100,
        cls: kind === "add" ? styles.tickAdd : kind === "del" ? styles.tickDel : styles.tickMod,
      };
    });
  }, [items.length, result.hunks, result.rows, rowToItem]);

  return (
    <div className={styles.diff}>
      <div className={styles.withRuler}>
        <div ref={scrollRef} className={styles.scroll}>
          <div className={styles.sizer} style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((vi) => {
              const it = items[vi.index];
              const isActive = !!activeHunk && it.index !== undefined && it.index >= activeHunk.start && it.index <= activeHunk.end;
              return (
                <div
                  key={vi.key}
                  data-index={vi.index}
                  ref={virtualizer.measureElement}
                  className={styles.vrow}
                  style={{ transform: `translateY(${vi.start}px)` }}>
                  {it.kind === "fold" ? (
                    <div className={styles.fold} onClick={() => setExpanded((prev) => new Set(prev).add(it.foldKey!))}>
                      {t("foldHidden", { n: it.foldCount ?? 0 })}
                    </div>
                  ) : view === "unified" ? (
                    unifiedLines(it.row!, isActive)
                  ) : (
                    <div className={isActive ? `${styles.row} ${styles.current}` : styles.row}>
                      {cell(it.row!, "a")}
                      <div className={styles.split} />
                      {cell(it.row!, "b")}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        {ticks.length > 0 && (
          <div className={styles.ruler} aria-hidden>
            {ticks.map((tk) => (
              <div
                key={tk.i}
                className={`${styles.tick} ${tk.cls}`}
                style={{ top: `${tk.top}%`, height: `${Math.max(tk.height, 0.6)}%` }}
                onClick={() => onSelectHunk?.(tk.i)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

DiffPane.displayName = "DiffPane";

export default DiffPane;
