"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import styles from "./textDiff.module.css";

// Editor metrics shared by the textarea AND the hidden mirror used to measure
// where each logical line starts. They MUST match (font, size, line-height,
// padding, wrap rules) or the line numbers drift from the wrapped rows.
const LINE_HEIGHT = 20;
const FONT_SIZE = 13;
const PAD_Y = 8;

// The gutter builds one number + one mirror <div> per logical line. These are
// created IMPERATIVELY (raw DOM in an effect), not via React's render — at 20k
// lines raw DOM costs ~0.45s while letting React reconcile 40k nodes costs
// ~2.3s. ~50k lands around ~1s, which we accept; above this cap we drop the
// gutter (plain textarea) as a memory + responsiveness guard. The result pane
// keeps line numbers so context isn't lost.
const MAX_GUTTER_LINES = 50000;
const ZWSP = "​"; // gives an empty line's mirror div a full line-box height

interface CodeInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minRows?: number;
  maxRows?: number;
  onDragOver?: React.DragEventHandler<HTMLTextAreaElement>;
  onDrop?: React.DragEventHandler<HTMLTextAreaElement>;
}

const CodeInput = ({ value, onChange, placeholder, minRows = 6, maxRows = 14, onDragOver, onDrop }: CodeInputProps) => {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const gutterInnerRef = useRef<HTMLDivElement>(null);
  // Mirror of the latest value, read inside the stable doLayout without making it
  // a dependency (which would re-subscribe the ResizeObserver every keystroke).
  // Updated in the layout effect below — never during render.
  const valueRef = useRef(value);

  // Cheap line count (no array allocation) to decide gutter vs plain + width.
  const lineCount = useMemo(() => {
    let n = 1;
    for (let i = value.indexOf("\n"); i !== -1; i = value.indexOf("\n", i + 1)) n++;
    return n;
  }, [value]);
  const withGutter = lineCount <= MAX_GUTTER_LINES;
  // Widen the gutter for big files so multi-digit numbers don't clip.
  const gutterWidth = Math.max(44, String(lineCount).length * 9 + 22);

  // Autosize the textarea, then (with gutter) rebuild the mirror, measure each
  // line's wrapped top, and lay out the numbers at those tops — all imperative.
  const doLayout = useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const min = minRows * LINE_HEIGHT + PAD_Y * 2;
    const max = maxRows * LINE_HEIGHT + PAD_Y * 2;
    const h = Math.min(Math.max(ta.scrollHeight, min), max);
    ta.style.height = `${h}px`;

    const gutter = gutterRef.current;
    const mirror = mirrorRef.current;
    const inner = gutterInnerRef.current;
    if (!gutter || !mirror || !inner) return; // over cap → plain textarea
    gutter.style.height = `${h}px`;

    const lines = valueRef.current.split("\n");
    // Mirror wraps exactly like the textarea: match its content width (clientWidth
    // already excludes any vertical scrollbar).
    mirror.style.width = `${ta.clientWidth}px`;
    const mFrag = document.createDocumentFragment();
    for (const ln of lines) {
      const d = document.createElement("div");
      d.textContent = ln === "" ? ZWSP : ln;
      mFrag.appendChild(d);
    }
    mirror.replaceChildren(mFrag);

    // Reading offsetTop forces one layout; subsequent reads are cached.
    const children = mirror.children;
    const nFrag = document.createDocumentFragment();
    for (let i = 0; i < children.length; i++) {
      const d = document.createElement("div");
      d.className = styles.gutterNum;
      d.style.top = `${(children[i] as HTMLElement).offsetTop}px`;
      d.textContent = String(i + 1);
      nFrag.appendChild(d);
    }
    inner.replaceChildren(nFrag);
  }, [minRows, maxRows]);

  // Rebuild on edit and when the gutter toggles on/off (containers mount/unmount).
  useLayoutEffect(() => {
    valueRef.current = value;
    doLayout();
  }, [value, withGutter, doLayout]);

  // Re-measure when the pane resizes (wrap changes) and once the mono font loads
  // (metrics shift on swap, which would otherwise leave numbers half a row off).
  // doLayout is stable, so this subscribes once.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    const ro = new ResizeObserver(() => doLayout());
    ro.observe(ta);
    let cancelled = false;
    document.fonts?.ready.then(() => { if (!cancelled) doLayout(); });
    return () => { cancelled = true; ro.disconnect(); };
  }, [doLayout]);

  const syncScroll = () => {
    const ta = taRef.current;
    const inner = gutterInnerRef.current;
    if (ta && inner) inner.style.transform = `translateY(${-ta.scrollTop}px)`;
  };

  return (
    <div className={styles.editor}>
      {withGutter && (
        <div ref={gutterRef} className={styles.gutter} style={{ width: gutterWidth }} aria-hidden>
          {/* numbers are populated imperatively by doLayout */}
          <div ref={gutterInnerRef} className={styles.gutterInner} />
        </div>
      )}
      <div className={styles.taWrap}>
        {/* Hidden mirror: same box + wrap rules as the textarea; its per-line
            divs are populated imperatively and used only to measure line tops. */}
        {withGutter && <div ref={mirrorRef} className={styles.mirror} aria-hidden />}
        <textarea
          ref={taRef}
          className={styles.codeArea}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={syncScroll}
          onDragOver={onDragOver}
          onDrop={onDrop}
          placeholder={placeholder}
          spellCheck={false}
          style={{ fontSize: FONT_SIZE, lineHeight: `${LINE_HEIGHT}px` }}
        />
      </div>
    </div>
  );
};

export default CodeInput;
