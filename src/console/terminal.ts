// The console's state and behaviour, apart from React: the scrollback, the
// history, the one running job, completion and the masked prompt. The panel
// draws a snapshot of it through useSyncExternalStore.

import { tokenize } from "../words";

export type LineKind = "input" | "output" | "error" | "info";

export interface Line {
  id: number;
  kind: LineKind;
  text: string;
}

export interface ProgressLine {
  /** Rewrite the line; `fraction` (0 to 1) is how far along it is. */
  update(text: string, fraction?: number): void;
  /** Finish the line with `text`, or leave it as it last read. */
  done(text?: string): void;
}

export interface CommandContext {
  print(text: string): void;
  error(text: string): void;
  info(text: string): void;
  /** A line the command rewrites as it goes (a percentage). */
  progress(text: string): ProgressLine;
  /** Ask for a value with the prompt masked; null when cancelled. */
  askSecret(label: string): Promise<string | null>;
  signal: AbortSignal;
}

export interface Command {
  summary: string;
  usage: string;
  subcommands?: readonly string[];
  run(ctx: CommandContext, words: string[]): void | Promise<void>;
}

export type CommandTable = Readonly<Record<string, Command>>;

/** A table, or a function giving the table as it stands now: other
 *  extensions' commands come and go while the console is open. */
export type CommandSource = CommandTable | (() => CommandTable);

export function tableOf(source: CommandSource): CommandTable {
  return typeof source === "function" ? source() : source;
}

export interface Snapshot {
  lines: readonly Line[];
  history: readonly string[];
  busy: boolean;
  prompt: { label: string; secret: true } | null;
}

export interface TerminalOptions {
  history?: readonly string[];
  saveHistory?(history: readonly string[]): void;
  maxLines?: number;
}

const MAX_HISTORY = 200;

export class Terminal {
  private snapshot: Snapshot;
  private listeners = new Set<() => void>();
  private nextId = 1;
  private job: AbortController | null = null;
  private secret: ((value: string | null) => void) | null = null;
  /** Where Up/Down stands: an index into the history, or its length for the draft. */
  private cursor: number;
  private draft = "";

  constructor(
    private readonly commands: CommandSource,
    private readonly options: TerminalOptions = {},
  ) {
    const history = (options.history ?? []).slice(-MAX_HISTORY);
    this.snapshot = { lines: [], history, busy: false, prompt: null };
    this.cursor = history.length;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): Snapshot => this.snapshot;

  private set(patch: Partial<Snapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  private push(kind: LineKind, text: string): number {
    const id = this.nextId++;
    const max = this.options.maxLines ?? 2000;
    this.set({ lines: [...this.snapshot.lines, { id, kind, text }].slice(-max) });
    return id;
  }

  private replace(id: number, text: string): void {
    this.set({ lines: this.snapshot.lines.map((l) => (l.id === id ? { ...l, text } : l)) });
  }

  write(kind: LineKind, text: string): void {
    for (const part of text.split("\n")) this.push(kind, part);
  }

  clear(): void {
    this.set({ lines: [] });
  }

  async submit(line: string): Promise<void> {
    if (this.secret) {
      const answer = this.secret;
      this.secret = null;
      this.push("info", `${this.snapshot.prompt?.label ?? ""} ${"•".repeat(Math.min(6, line.length))}`);
      this.set({ prompt: null });
      answer(line);
      return;
    }
    if (!line.trim()) return;
    this.push("input", line);
    this.remember(line);
    if (this.job) {
      this.push("error", "Wait for the running command, or press Ctrl+C to stop it.");
      return;
    }
    let words: string[];
    try {
      words = tokenize(line);
    } catch (e) {
      this.push("error", (e as Error).message);
      return;
    }
    const [name, ...rest] = words;
    if (name === "help") return this.help(rest[0]);
    if (name === "clear") return this.clear();
    const table = tableOf(this.commands);
    const command = Object.hasOwn(table, name) ? table[name] : undefined;
    if (!command) {
      this.push("error", `Unknown command "${name}". Type help for the list.`);
      return;
    }
    const job = new AbortController();
    this.job = job;
    this.set({ busy: true });
    try {
      await command.run(this.context(job.signal), rest);
    } catch (e) {
      if (job.signal.aborted) this.push("info", "Stopped.");
      else this.write("error", e instanceof Error ? e.message : String(e));
    } finally {
      this.job = null;
      this.set({ busy: false, prompt: null });
      this.secret = null;
    }
  }

  /** Ctrl+C: stop the running job, or cancel the masked prompt. */
  cancel(): void {
    if (this.secret) {
      const answer = this.secret;
      this.secret = null;
      this.set({ prompt: null });
      answer(null);
      return;
    }
    this.job?.abort();
  }

  private context(signal: AbortSignal): CommandContext {
    return {
      signal,
      print: (text) => this.write("output", text),
      error: (text) => this.write("error", text),
      info: (text) => this.write("info", text),
      progress: (text) => {
        const id = this.push("info", text);
        return {
          update: (t) => this.replace(id, t),
          done: (t) => {
            if (t !== undefined) this.replace(id, t);
          },
        };
      },
      askSecret: (label) =>
        new Promise<string | null>((resolve) => {
          this.secret = resolve;
          this.set({ prompt: { label, secret: true } });
        }),
    };
  }

  private help(name: string | undefined): void {
    const table = tableOf(this.commands);
    if (name) {
      const command = Object.hasOwn(table, name) ? table[name] : undefined;
      if (!command) {
        this.push("error", `Unknown command "${name}".`);
        return;
      }
      this.push("output", command.usage);
      if (command.summary) this.push("output", command.summary);
      return;
    }
    const rows: [string, string][] = [
      ...Object.entries(table).map(([n, c]): [string, string] => [n, c.summary]),
      ["help", "list the commands, or help <command>"],
      ["clear", "clear the console (Ctrl+L)"],
    ];
    const width = Math.max(...rows.map(([n]) => n.length));
    for (const [n, summary] of rows) this.push("output", `  ${n.padEnd(width)}  ${summary}`);
  }

  private remember(line: string): void {
    const history = this.snapshot.history;
    const next = history[history.length - 1] === line ? history : [...history, line].slice(-MAX_HISTORY);
    this.cursor = next.length;
    this.draft = "";
    if (next !== history) {
      this.set({ history: next });
      this.options.saveHistory?.(next);
    }
  }

  /** Up (-1) or Down (+1) through the history from what the prompt holds. */
  historyStep(direction: -1 | 1, current: string): string {
    const history = this.snapshot.history;
    if (this.cursor === history.length) this.draft = current;
    this.cursor = Math.max(0, Math.min(history.length, this.cursor + direction));
    return this.cursor === history.length ? this.draft : history[this.cursor];
  }
}
