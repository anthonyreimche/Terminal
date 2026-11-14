// The console: the scrollback over a prompt, or an editor in its place while
// an effect or endpoint is open.

import type { EditTarget } from "./commands";
import type { Observable } from "./console/observable";
import { applySuggestion, type Suggestions } from "./console/suggest";
import { SuggestionList } from "./console/SuggestionList";
import type { Terminal, LineKind } from "./console/terminal";
import type { Compile } from "./effects/glsl";
import type { Endpoint } from "./endpoints/endpoint";
import { EffectEditor } from "./EffectEditor";
import { EndpointEditor } from "./EndpointEditor";
import type { EffectRecord } from "./library";
import { React, api } from "./rt";

export interface PanelDeps {
  terminal: Terminal;
  editing: Observable<EditTarget | null>;
  /** Bumped when the shortcut opens the Terminal: the prompt takes focus. */
  focus: Observable<number>;
  compile(): Compile | null;
  saveEffect(record: EffectRecord, isNew: boolean): void;
  saveEndpoint(record: Endpoint, isNew: boolean): Promise<void>;
  /** Suggestions for the word at `cursor` in the prompt. */
  suggest(text: string, cursor: number): Suggestions;
}

export function makeTerminalPanel(deps: PanelDeps) {
  return function TerminalPanel() {
    const editing = React.useSyncExternalStore(deps.editing.subscribe, deps.editing.get);
    const close = () => deps.editing.set(null);
    if (editing?.kind === "effect") {
      return (
        <EffectEditor
          key={editing.record.slug}
          record={editing.record}
          isNew={editing.isNew}
          compile={deps.compile()}
          onSave={(record) => {
            deps.saveEffect(record, editing.isNew);
            close();
          }}
          onClose={close}
        />
      );
    }
    if (editing?.kind === "endpoint") {
      return (
        <EndpointEditor
          key={editing.record.slug}
          record={editing.record}
          isNew={editing.isNew}
          onSave={async (record) => {
            await deps.saveEndpoint(record, editing.isNew);
            close();
          }}
          onClose={close}
        />
      );
    }
    return <Console deps={deps} />;
  };
}

function Console({ deps }: { deps: PanelDeps }) {
  const { terminal } = deps;
  const snap = React.useSyncExternalStore(terminal.subscribe, terminal.getSnapshot);
  const focusTick = React.useSyncExternalStore(deps.focus.subscribe, deps.focus.get);
  const [text, setText] = React.useState("");
  const [cursor, setCursor] = React.useState(0);
  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState(0);
  const input = React.useRef<HTMLInputElement>(null);
  const scroller = React.useRef<HTMLDivElement>(null);
  const placeCursor = React.useRef<number | null>(null);
  const t = api.ui.tokens;

  const suggestions = React.useMemo(
    () => (open && !snap.prompt ? deps.suggest(text, cursor) : null),
    [open, snap.prompt, text, cursor],
  );
  const items = suggestions?.items ?? [];
  const showing = items.length > 0;

  React.useEffect(() => {
    input.current?.focus();
  }, [focusTick]);

  React.useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [snap.lines]);

  React.useLayoutEffect(() => {
    if (placeCursor.current === null || !input.current) return;
    input.current.setSelectionRange(placeCursor.current, placeCursor.current);
    placeCursor.current = null;
  });

  const edit = (value: string, at: number, keepOpen: boolean) => {
    setText(value);
    setCursor(at);
    setSelected(0);
    setOpen(keepOpen);
  };

  const accept = (index: number) => {
    if (!suggestions || !items[index]) return;
    const next = applySuggestion(text, suggestions, items[index]);
    placeCursor.current = next.cursor;
    edit(next.text, next.cursor, true);
  };

  const colour: Record<LineKind, string> = {
    input: t.textSecondary,
    output: t.textPrimary,
    error: t.labelRed,
    info: t.textMuted,
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (showing && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setSelected((s) => (s + step + items.length) % items.length);
    } else if (showing && e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    } else if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      if (snap.prompt) return;
      if (showing) accept(selected);
      else {
        const at = e.currentTarget.selectionStart ?? text.length;
        const now = deps.suggest(text, at);
        if (now.items.length === 1) {
          const next = applySuggestion(text, now, now.items[0]);
          placeCursor.current = next.cursor;
          edit(next.text, next.cursor, true);
        } else {
          setCursor(at);
          setSelected(0);
          setOpen(true);
        }
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      const line = text;
      edit("", 0, false);
      void terminal.submit(line);
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      if (snap.prompt) return;
      e.preventDefault();
      const line = terminal.historyStep(e.key === "ArrowUp" ? -1 : 1, text);
      placeCursor.current = line.length;
      edit(line, line.length, false);
    } else if (ctrl && !e.shiftKey && !e.altKey && e.key === " ") {
      e.preventDefault();
      setCursor(e.currentTarget.selectionStart ?? text.length);
      setOpen(true);
    } else if (ctrl && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "l") {
      e.preventDefault();
      terminal.clear();
    } else if (ctrl && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "c") {
      const el = e.currentTarget;
      const selectedText = el.selectionStart !== el.selectionEnd || !!window.getSelection()?.toString();
      if (selectedText) return;
      e.preventDefault();
      if (snap.busy || snap.prompt) terminal.cancel();
      else if (text) {
        terminal.write("input", `${text}^C`);
        edit("", 0, false);
      }
    }
  };

  const listId = "terminal-suggestions";
  return (
    <div
      style={{ display: "flex", flexDirection: "column", height: "100%", background: t.surface0, fontFamily: t.fontCode, fontSize: 12 }}
      onMouseUp={() => {
        if (!window.getSelection()?.toString()) input.current?.focus();
      }}
    >
      <div ref={scroller} role="log" aria-live="polite" style={{ flex: 1, overflow: "auto", padding: "4px 8px", userSelect: "text" }}>
        {snap.lines.length === 0 && <div style={{ color: t.textMuted }}>Terminal. Type help for the commands; Tab takes a suggestion.</div>}
        {snap.lines.map((line) => (
          <div key={line.id} style={{ color: colour[line.kind], whiteSpace: "pre-wrap", wordBreak: "break-word", minHeight: "1.4em" }}>
            {line.kind === "input" ? `› ${line.text}` : line.text}
          </div>
        ))}
      </div>
      <label style={{ position: "relative", display: "flex", alignItems: "center", gap: 6, padding: "3px 8px", borderTop: `1px solid ${t.borderSubtle}` }}>
        {showing && <SuggestionList id={listId} items={items} selected={selected} side="above" onPick={accept} />}
        <span style={{ color: snap.busy && !snap.prompt ? t.textMuted : t.accent }}>{snap.prompt ? snap.prompt.label : "›"}</span>
        <input
          ref={input}
          aria-label={snap.prompt ? snap.prompt.label : "Command"}
          role="combobox"
          aria-expanded={showing}
          aria-controls={showing ? listId : undefined}
          aria-activedescendant={showing ? `${listId}-${selected}` : undefined}
          aria-autocomplete="list"
          type={snap.prompt ? "password" : "text"}
          autoComplete="off"
          spellCheck={false}
          value={text}
          placeholder={snap.busy && !snap.prompt ? "Running… Ctrl+C stops it" : ""}
          onChange={(e) => edit(e.target.value, e.target.selectionStart ?? e.target.value.length, e.target.value.trim() !== "")}
          onSelect={(e) => setCursor(e.currentTarget.selectionStart ?? text.length)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          style={{
            flex: 1,
            minWidth: 0,
            background: "transparent",
            border: "none",
            outline: "none",
            color: t.textPrimary,
            font: "inherit",
            padding: "2px 0",
          }}
        />
      </label>
    </div>
  );
}
