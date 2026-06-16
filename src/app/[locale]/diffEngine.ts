import { diffArrays, diffChars } from "diff";
import { detectFormat, guessDelimiter, parseDelimited, locateFirstField, type FormatKind, type FieldLocation } from "./formats";

export type DiffRowKind = "same" | "add" | "del" | "mod";

export interface InlineSpan {
  text: string;
  changed: boolean;
}

export interface DiffRow {
  kind: DiffRowKind;
  aLine?: number;
  bLine?: number;
  aText?: string;
  bText?: string;
  /** char-level spans for a mod row (only when charLevel on). */
  aSpans?: InlineSpan[];
  bSpans?: InlineSpan[];
  /** true on the row that holds the first difference. */
  first?: boolean;
}

export interface FirstDiff {
  kind: DiffRowKind;
  /** 1-based line number on whichever side the change is. */
  line: number;
  field?: FieldLocation;
  before?: string;
  after?: string;
  /** index into rows[] for scroll-to. */
  rowIndex: number;
}

export interface DiffOptions {
  format: FormatKind;
  ignoreWhitespace: boolean;
  ignoreCase: boolean;
  charLevel: boolean;
}

export interface DiffResult {
  rows: DiffRow[];
  hunks: { start: number; end: number }[];
  stats: { mods: number; adds: number; dels: number };
  first: FirstDiff;
}

export { detectFormat }; // re-export for the UI's single import site

/** Normalize newlines and strip a leading BOM char. */
export function normalize(text: string): string {
  return text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
}

function splitLines(value: string): string[] {
  const lines = value.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function inlineSpans(a: string, b: string): { aSpans: InlineSpan[]; bSpans: InlineSpan[] } {
  const parts = diffChars(a, b);
  const aSpans: InlineSpan[] = [];
  const bSpans: InlineSpan[] = [];
  for (const p of parts) {
    if (p.added) bSpans.push({ text: p.value, changed: true });
    else if (p.removed) aSpans.push({ text: p.value, changed: true });
    else {
      aSpans.push({ text: p.value, changed: false });
      bSpans.push({ text: p.value, changed: false });
    }
  }
  return { aSpans, bSpans };
}

export function computeDiff(aRaw: string, bRaw: string, opts: DiffOptions): DiffResult {
  const a = normalize(aRaw);
  const b = normalize(bRaw);

  // Split into line arrays and diff THOSE (not the raw strings). Diffing line
  // arrays compares lines by content, so a trailing newline on one side — or an
  // appended line — no longer makes a shared last line look "modified" the way
  // newline-keeping string tokenization (diffLines) does. Display always uses
  // these original lines; the comparator applies ignore-options to matching only.
  const aOrigLines = splitLines(a);
  const bOrigLines = splitLines(b);

  const normLine = (s: string) => {
    let x = s;
    if (opts.ignoreWhitespace) x = x.trim();
    if (opts.ignoreCase) x = x.toLowerCase();
    return x;
  };
  const parts = diffArrays(aOrigLines, bOrigLines, { comparator: (l, r) => normLine(l) === normLine(r) });

  // CSV/TSV header + delimiter context from side A's first line.
  const aFirstLine = a.split("\n", 1)[0] ?? "";
  const delimiter = opts.format === "tsv" ? "\t" : opts.format === "csv" ? (guessDelimiter(a.split("\n")) ?? ",") : undefined;
  const header = opts.format === "csv" || opts.format === "tsv" ? parseDelimited(aFirstLine, delimiter ?? ",") : undefined;

  const rows: DiffRow[] = [];
  let aIdx = 0; // cursor into aOrigLines
  let bIdx = 0; // cursor into bOrigLines
  let aLine = 1; // 1-based line number for A
  let bLine = 1; // 1-based line number for B
  let mods = 0;
  let adds = 0;
  let dels = 0;

  const pending: { removed: string[]; added: string[] } = { removed: [], added: [] };

  const flushPending = () => {
    const { removed, added } = pending;
    const pairs = Math.min(removed.length, added.length);
    for (let i = 0; i < pairs; i++) {
      const row: DiffRow = { kind: "mod", aLine: aLine++, bLine: bLine++, aText: removed[i], bText: added[i] };
      if (opts.charLevel) {
        const s = inlineSpans(removed[i], added[i]);
        row.aSpans = s.aSpans;
        row.bSpans = s.bSpans;
      }
      rows.push(row);
      mods++;
    }
    for (let i = pairs; i < removed.length; i++) {
      rows.push({ kind: "del", aLine: aLine++, aText: removed[i] });
      dels++;
    }
    for (let i = pairs; i < added.length; i++) {
      rows.push({ kind: "add", bLine: bLine++, bText: added[i] });
      adds++;
    }
    pending.removed = [];
    pending.added = [];
  };

  for (const part of parts) {
    const count = part.count ?? part.value.length;
    if (part.removed) {
      // Recover original A lines
      const origSlice = aOrigLines.slice(aIdx, aIdx + count);
      pending.removed.push(...origSlice);
      aIdx += count;
    } else if (part.added) {
      // Recover original B lines
      const origSlice = bOrigLines.slice(bIdx, bIdx + count);
      pending.added.push(...origSlice);
      bIdx += count;
    } else {
      flushPending();
      // EQ: use original lines from both sides (handles ignoreCase/ignoreWhitespace display)
      for (let i = 0; i < count; i++) {
        rows.push({
          kind: "same",
          aLine: aLine++,
          bLine: bLine++,
          aText: aOrigLines[aIdx + i],
          bText: bOrigLines[bIdx + i],
        });
      }
      aIdx += count;
      bIdx += count;
    }
  }
  flushPending();

  // Group contiguous non-same rows into hunks (block navigation).
  const hunks: { start: number; end: number }[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].kind === "same") continue;
    const start = i;
    while (i < rows.length && rows[i].kind !== "same") i++;
    hunks.push({ start, end: i - 1 });
  }

  // First difference: first non-same row.
  let first: FirstDiff;
  const firstIdx = rows.findIndex((r) => r.kind !== "same");
  if (firstIdx === -1) {
    first = { kind: "same", line: 0, rowIndex: -1 };
  } else {
    const r = rows[firstIdx];
    r.first = true;
    if (r.kind === "mod") {
      const field = locateFirstField(opts.format, r.aText ?? "", r.bText ?? "", { header, delimiter });
      first = { kind: "mod", line: r.bLine ?? r.aLine ?? 0, field, before: field.before, after: field.after, rowIndex: firstIdx };
    } else if (r.kind === "del") {
      first = { kind: "del", line: r.aLine ?? 0, rowIndex: firstIdx };
    } else {
      first = { kind: "add", line: r.bLine ?? 0, rowIndex: firstIdx };
    }
  }

  return { rows, hunks, stats: { mods, adds, dels }, first };
}
