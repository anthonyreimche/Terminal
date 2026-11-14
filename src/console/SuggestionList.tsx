// The suggestions under the prompt or editor: a listbox the keyboard drives
// from the field (which keeps focus), and the mouse can pick from.

import { React, api } from "../rt";
import type { Suggestion } from "./suggest";

const VISIBLE = 8;
const ROW = 20;

export function SuggestionList(props: {
  id: string;
  items: readonly Suggestion[];
  selected: number;
  /** Which side of its container the list sits on. */
  side: "above" | "below";
  onPick(index: number): void;
}) {
  const t = api.ui.tokens;
  const list = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${props.selected}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [props.selected]);
  const detail = props.items[props.selected]?.detail;
  return (
    <div
      ref={list}
      id={props.id}
      role="listbox"
      aria-label="Suggestions"
      onMouseDown={(e) => e.preventDefault()}
      style={{
        position: "absolute",
        left: 8,
        [props.side === "above" ? "bottom" : "top"]: "100%",
        zIndex: 10,
        minWidth: 220,
        maxWidth: "calc(100% - 16px)",
        maxHeight: VISIBLE * ROW + 4,
        overflowY: "auto",
        background: t.surface2,
        border: `1px solid ${t.border}`,
        borderRadius: 4,
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.35)",
        fontFamily: t.fontCode,
        fontSize: 12,
        padding: 2,
      }}
    >
      {props.items.map((item, i) => (
        <div
          key={`${item.label}-${i}`}
          id={`${props.id}-${i}`}
          data-index={i}
          role="option"
          aria-selected={i === props.selected}
          onClick={() => props.onPick(i)}
          style={{
            display: "flex",
            gap: 12,
            alignItems: "baseline",
            height: ROW,
            lineHeight: `${ROW}px`,
            padding: "0 6px",
            borderRadius: 3,
            cursor: "pointer",
            whiteSpace: "nowrap",
            background: i === props.selected ? t.surface4 : "transparent",
            color: t.textPrimary,
          }}
        >
          <span>{item.label}</span>
        </div>
      ))}
      {detail && (
        <div style={{ borderTop: `1px solid ${t.borderSubtle}`, marginTop: 2, padding: "3px 6px", color: t.textMuted, whiteSpace: "normal" }}>
          {detail}
        </div>
      )}
    </div>
  );
}
