// Pure, framework-free format detection + field splitting for the Text Diff tool.

export type FormatKind = "plain" | "csv" | "tsv" | "ini" | "json";

export interface FieldLocation {
  /** 0-based column index (csv/tsv only). */
  col?: number;
  /** Header column name (csv/tsv) or key name (ini). */
  name?: string;
  /** 0-based first differing char index by Unicode code point (plain/json). */
  charIndex?: number;
  /** Original "before" value (A side) for the located field. */
  before?: string;
  /** Original "after" value (B side) for the located field. */
  after?: string;
}

const DELIMITERS = [",", "\t", ";", "|"] as const;

/** Quote-aware split of one delimited line. Handles "a,b" and "" escapes. */
export function parseDelimited(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      out.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out;
}

/** Pick the delimiter whose column count is most consistent (and >1) across sample lines. */
export function guessDelimiter(lines: string[]): string | null {
  const sample = lines.filter((l) => l.trim() !== "").slice(0, 20);
  if (sample.length === 0) return null;
  let best: string | null = null;
  let bestScore = 0;
  for (const d of DELIMITERS) {
    const counts = sample.map((l) => parseDelimited(l, d).length);
    if (counts.every((c) => c < 2)) continue; // delimiter not present
    const mode = counts.sort((a, b) => a - b)[Math.floor(counts.length / 2)];
    const consistent = counts.filter((c) => c === mode).length;
    // score: prefer high consistency, then more columns
    const score = consistent * 100 + mode;
    if (mode >= 2 && score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

// NOTE: no `\s*` before `[=:]` — `[^=:]*` already consumes spaces, and adding a
// second whitespace quantifier there makes the regex backtrack O(n^2) on long
// whitespace runs (a line with no '='/':'). Keep the classes non-overlapping.
const KV_RE = /^\s*[^#;\s][^=:]*[=:]\s*.*$/;

/** Detect format by extension first, then content sniffing. */
export function detectFormat(filename: string | null, text: string): FormatKind {
  const ext = filename?.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (ext === "csv") return "csv";
  if (ext === "tsv") return "tsv";
  if (ext === "json") return "json";
  if (ext === "ini" || ext === "conf" || ext === "properties") return "ini";

  const lines = text.split("\n").filter((l) => l.trim() !== "");
  if (lines.length === 0) return "plain";

  const delim = guessDelimiter(lines);
  if (delim) return delim === "\t" ? "tsv" : "csv";

  const kvCount = lines.filter((l) => KV_RE.test(l)).length;
  if (kvCount / lines.length > 0.6) return "ini";

  try {
    JSON.parse(text);
    return "json";
  } catch {
    /* not json */
  }
  return "plain";
}

/** Parse "key = value" / "key: value"; returns null for non-kv lines. */
function parseIniLine(line: string): { key: string; value: string } | null {
  // No `\s*` before `[=:]` (see KV_RE note): the lazy `[^=:]*?` already covers
  // trailing spaces, which `.trim()` strips from the key. Avoids O(n^2) backtracking.
  const m = line.match(/^\s*([^#;=:][^=:]*?)[=:]\s*(.*)$/);
  if (!m) return null;
  return { key: m[1].trim(), value: m[2] };
}

/** Locate the first differing field between two changed lines, per format. */
export function locateFirstField(
  format: FormatKind,
  aLine: string,
  bLine: string,
  ctx: { header?: string[]; delimiter?: string },
): FieldLocation {
  if (format === "csv" || format === "tsv") {
    const delim = ctx.delimiter ?? (format === "tsv" ? "\t" : ",");
    const a = parseDelimited(aLine, delim);
    const b = parseDelimited(bLine, delim);
    const max = Math.max(a.length, b.length);
    for (let i = 0; i < max; i++) {
      if (a[i] !== b[i]) {
        return { col: i, name: ctx.header?.[i], before: a[i] ?? "", after: b[i] ?? "" };
      }
    }
    return { before: aLine, after: bLine };
  }

  if (format === "ini") {
    const a = parseIniLine(aLine);
    const b = parseIniLine(bLine);
    if (a && b && a.key === b.key) {
      return { name: a.key, before: a.value, after: b.value };
    }
    // key itself changed or unparseable — fall through to char diff
  }

  // plain / json / ini-fallback: first differing code point
  const aChars = Array.from(aLine);
  const bChars = Array.from(bLine);
  const max = Math.max(aChars.length, bChars.length);
  for (let i = 0; i < max; i++) {
    if (aChars[i] !== bChars[i]) {
      return { charIndex: i, before: aLine, after: bLine };
    }
  }
  return { charIndex: 0, before: aLine, after: bLine };
}
