// Editing an effect's source. Save checks the header, the GLSL body and (for
// GLSL, where WebGL2 is there) compiles it, and keeps it only without errors.

import { SuggestionList } from "./console/SuggestionList";
import { applyCode, suggestCode } from "./effects/code-suggest";
import type { EffectRecord } from "./library";
import { ENGINES } from "./effects/engines";
import { buildStage, checkBody, compileCheck, type Compile } from "./effects/glsl";
import { parseHeader, type HeaderError } from "./effects/header";
import { React, api } from "./rt";

export interface EffectCheck {
  errors: HeaderError[];
  warnings: HeaderError[];
}

export function checkEffect(record: EffectRecord, compile: Compile | null): EffectCheck {
  const header = parseHeader(record.source, record.kind);
  if (!header.ok) return { errors: header.errors, warnings: [] };
  if (record.kind !== "glsl") return { errors: [], warnings: [] };
  const body = checkBody(record.source);
  if (body.length) return { errors: body, warnings: [] };
  if (!compile) return { errors: [], warnings: [{ line: 0, message: "Not compiled ahead: no WebGL2 here. Develop reports any error." }] };
  return compileCheck(buildStage(record, header), compile);
}

const describe = (e: HeaderError) => (e.line ? `line ${e.line}: ${e.message}` : e.message);

export function EffectEditor(props: {
  record: EffectRecord;
  isNew: boolean;
  compile: Compile | null;
  onSave(record: EffectRecord): void;
  onClose(): void;
}) {
  const { Button, TextArea, Row } = api.ui;
  const t = api.ui.tokens;
  const [source, setSource] = React.useState(props.record.source);
  const [check, setCheck] = React.useState<EffectCheck | null>(null);
  const [caret, setCaret] = React.useState(0);
  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState(0);
  const area = React.useRef<HTMLTextAreaElement | null>(null);
  const placeCaret = React.useRef<number | null>(null);
  const engine = ENGINES[props.record.kind];
  const kind = props.record.kind === "gmic" ? null : props.record.kind;

  const suggestions = React.useMemo(() => (open && kind ? suggestCode(source, caret, kind) : null), [open, kind, source, caret]);
  const items = suggestions?.items ?? [];
  const showing = items.length > 0;

  React.useLayoutEffect(() => {
    if (placeCaret.current === null || !area.current) return;
    area.current.setSelectionRange(placeCaret.current, placeCaret.current);
    placeCaret.current = null;
  });

  const accept = (index: number) => {
    if (!suggestions || !items[index]) return;
    const next = applyCode(source, suggestions, items[index]);
    placeCaret.current = next.cursor;
    setSource(next.text);
    setCaret(next.cursor);
    setSelected(0);
    setOpen(next.text.slice(0, next.cursor).endsWith(" ") && /@\w+ $/.test(next.text.slice(0, next.cursor)));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    area.current = e.currentTarget;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key.toLowerCase() === "s") {
      e.preventDefault();
      save();
    } else if (ctrl && e.key === " ") {
      e.preventDefault();
      setCaret(e.currentTarget.selectionStart);
      setSelected(0);
      setOpen(true);
    } else if (showing && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setSelected((s) => (s + step + items.length) % items.length);
    } else if (showing && e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      accept(selected);
    } else if (showing && e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    } else if (e.key === "Enter" || e.key === "ArrowLeft" || e.key === "ArrowRight") {
      setOpen(false);
    }
  };

  const save = () => {
    const record = { ...props.record, source };
    const result = checkEffect(record, props.compile);
    setCheck(result);
    if (!result.errors.length) props.onSave(record);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 6, padding: 6, boxSizing: "border-box" }}>
      <Row gap={6}>
        <span style={{ color: t.textPrimary, fontSize: 12, flex: 1 }}>
          {props.record.name} <span style={{ color: t.textMuted }}>· {engine.label}{engine.live ? " · live" : " · run"}</span>
        </span>
        <Button size="sm" variant="primary" onClick={save}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={props.onClose}>
          {props.isNew ? "Discard" : "Close"}
        </Button>
      </Row>
      <div style={{ position: "relative", flex: 1, minHeight: 80, display: "flex" }}>
        <TextArea
          mono
          aria-label={`${props.record.name} source`}
          role="combobox"
          aria-expanded={showing}
          aria-controls={showing ? "terminal-code-suggestions" : undefined}
          aria-activedescendant={showing ? `terminal-code-suggestions-${selected}` : undefined}
          aria-autocomplete="list"
          spellCheck={false}
          value={source}
          onChange={(value) => {
            setSource(value);
            setSelected(0);
            setOpen(true);
          }}
          onInput={(e) => {
            area.current = e.currentTarget;
            setCaret(e.currentTarget.selectionStart);
          }}
          onSelect={(e) => {
            area.current = e.currentTarget;
            setCaret(e.currentTarget.selectionStart);
          }}
          onMouseDown={() => setOpen(false)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          style={{ flex: 1, resize: "none", fontFamily: t.fontCode, fontSize: 12 }}
        />
        {showing && <SuggestionList id="terminal-code-suggestions" items={items} selected={selected} side="above" onPick={accept} />}
      </div>
      {check && (check.errors.length > 0 || check.warnings.length > 0) && (
        <div role="status" style={{ fontFamily: t.fontCode, fontSize: 11, maxHeight: 80, overflow: "auto" }}>
          {check.errors.map((e, i) => (
            <div key={`e${i}`} style={{ color: t.labelRed }}>
              {describe(e)}
            </div>
          ))}
          {check.warnings.map((e, i) => (
            <div key={`w${i}`} style={{ color: t.textMuted }}>
              {describe(e)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
