// Suggestions for the word at the prompt's cursor: what the command grammar
// allows there, filled from the person's effects, endpoints and develop
// values. Matches at a word's start come first, then matches inside it.

import type { DevelopKey } from "../commands";
import type { Endpoint } from "../endpoints/endpoint";
import { ENGINES, type EffectKind } from "../effects/engines";
import { parseHeader, type ParamDecl } from "../effects/header";
import type { EffectRecord } from "../library";
import { tableOf, type CommandSource } from "./terminal";

export interface Suggestion {
  label: string;
  /** What replaces the word; a trailing space or "=" says what comes next. */
  insert: string;
  detail?: string;
}

export interface Suggestions {
  /** The span of the line the chosen suggestion replaces. */
  from: number;
  to: number;
  items: Suggestion[];
}

export interface LineSource {
  commands: CommandSource;
  effects(): EffectRecord[];
  endpoints(): Endpoint[];
  developKeys(): DevelopKey[];
}

const SUBCOMMAND_DETAIL: Record<string, Record<string, string>> = {
  fx: {
    list: "your effects",
    new: "write a new effect",
    edit: "change an effect",
    rm: "delete an effect",
    apply: "turn a GLSL effect on for the open photo",
    off: "turn a GLSL effect off for the open photo",
  },
  api: {
    list: "your endpoints",
    new: "set up an endpoint",
    edit: "change an endpoint",
    rm: "delete an endpoint and its key",
    key: "enter an endpoint's key",
    send: "send the photos",
  },
};

const BUILTINS: Suggestion[] = [
  { label: "help", insert: "help ", detail: "list the commands, or help <command>" },
  { label: "clear", insert: "clear ", detail: "clear the console (Ctrl+L)" },
];

const PLACEHOLDER = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

export function suggestLine(text: string, cursor: number, source: LineSource): Suggestions {
  let from = cursor;
  while (from > 0 && !/\s/.test(text[from - 1])) from--;
  let to = cursor;
  while (to < text.length && !/\s/.test(text[to])) to++;
  const word = text.slice(from, cursor);
  const before = text.slice(0, from).trim();
  const words = before ? before.split(/\s+/) : [];
  const later = text.slice(to).trim();
  const given = [...words, ...(later ? later.split(/\s+/) : [])];
  const items = rank(word, candidates(words, given, word, source));
  const only = items.length === 1 && items[0].insert.trim() === word ? [] : items;
  return { from, to, items: only };
}

/** The line with `item` in place of the word, and where the cursor goes. */
export function applySuggestion(text: string, s: Suggestions, item: Suggestion): { text: string; cursor: number } {
  const rest = text.slice(s.to);
  const insert = /^\s/.test(rest) ? item.insert.trimEnd() : item.insert;
  const cursor = s.from + insert.length + (/^\s/.test(rest) && insert !== item.insert ? 1 : 0);
  return { text: text.slice(0, s.from) + insert + rest, cursor };
}

function rank(word: string, items: Suggestion[]): Suggestion[] {
  const w = word.toLowerCase();
  if (!w) return items;
  const starts = items.filter((i) => i.label.toLowerCase().startsWith(w));
  const inside = items.filter((i) => !i.label.toLowerCase().startsWith(w) && i.label.toLowerCase().includes(w));
  return [...starts, ...inside];
}

function candidates(words: string[], given: string[], word: string, source: LineSource): Suggestion[] {
  const [command, sub] = words;
  const at = words.length;
  if (at === 0) {
    if (!word) return [];
    return [...Object.entries(tableOf(source.commands)).map(([name, c]) => ({ label: name, insert: `${name} `, detail: c.summary })), ...BUILTINS];
  }
  if (command === "help") return at === 1 ? Object.entries(tableOf(source.commands)).map(([name, c]) => ({ label: name, insert: `${name} `, detail: c.summary })) : [];
  if (command === "fx") return fxCandidates(at, sub, given, source);
  if (command === "run") {
    if (at === 1) return effectItems(source.effects().filter((e) => !ENGINES[e.kind].live && engineReady(e.kind, source)));
    const effect = source.effects().find((e) => e.slug === words[1]);
    const header = effect && effect.kind !== "gmic" ? parseHeader(effect.source, effect.kind) : null;
    return header?.ok ? paramItems(header.params, given, word) : [];
  }
  if (command === "api") return apiCandidates(at, sub, words, given, source);
  if (command === "get") return at === 1 ? keyItems(source.developKeys()) : [];
  if (command === "set") {
    if (at % 2 === 1) return keyItems(source.developKeys());
    const key = source.developKeys().find((k) => k.key === words[at - 1]);
    return key?.kind === "boolean" ? [plain("true"), plain("false")] : [];
  }
  const own = tableOf(source.commands)[command];
  return at === 1 && own?.subcommands ? own.subcommands.map((s) => ({ label: s, insert: `${s} ` })) : [];
}

function fxCandidates(at: number, sub: string | undefined, given: string[], source: LineSource): Suggestion[] {
  if (at === 1) return subItems("fx", source);
  const effects = source.effects();
  if (at === 2 && (sub === "edit" || sub === "rm")) return effectItems(effects);
  if (at === 2 && (sub === "apply" || sub === "off")) return effectItems(effects.filter((e) => e.kind === "glsl"));
  if (at >= 3 && sub === "new") {
    return (["glsl", "js", "gmic"] as const)
      .filter((k) => engineReady(k, source) && !given.includes(`--${k}`))
      .map((k) => ({ label: `--${k}`, insert: `--${k} `, detail: ENGINES[k].label }));
  }
  return [];
}

function apiCandidates(at: number, sub: string | undefined, words: string[], given: string[], source: LineSource): Suggestion[] {
  if (at === 1) return subItems("api", source);
  const endpoints = source.endpoints();
  if (at === 2 && sub && ["edit", "rm", "key", "send"].includes(sub)) {
    return endpoints.map((e) => ({ label: e.slug, insert: `${e.slug} `, detail: e.url }));
  }
  if (at >= 3 && sub === "send") {
    const ep = endpoints.find((e) => e.slug === words[2]);
    if (!ep) return [];
    const names: string[] = [];
    for (const text of [ep.url, ...Object.values(ep.fields), ...Object.values(ep.headers)]) {
      for (const m of text.matchAll(PLACEHOLDER)) if (m[1] !== "filename" && !names.includes(m[1])) names.push(m[1]);
    }
    return names.filter((n) => !isGiven(given, n)).map((n) => ({ label: `${n}=`, insert: `${n}=`, detail: "placeholder" }));
  }
  return [];
}

/** Whether effects of `kind` can be made and run: a G'MIC effect needs another
 *  extension's gmic command. */
function engineReady(kind: EffectKind, source: LineSource): boolean {
  if (kind === "gmic") return Object.hasOwn(tableOf(source.commands), "gmic");
  return !ENGINES[kind].unavailable;
}

function subItems(command: string, source: LineSource): Suggestion[] {
  const subs = tableOf(source.commands)[command]?.subcommands ?? [];
  return subs.map((s) => ({ label: s, insert: `${s} `, detail: SUBCOMMAND_DETAIL[command]?.[s] }));
}

function effectItems(effects: EffectRecord[]): Suggestion[] {
  return effects.map((e) => ({ label: e.slug, insert: `${e.slug} `, detail: ENGINES[e.kind].label }));
}

function keyItems(keys: DevelopKey[]): Suggestion[] {
  return keys.map((k) => ({ label: k.key, insert: `${k.key} `, detail: k.label === k.key ? undefined : k.label }));
}

function plain(word: string): Suggestion {
  return { label: word, insert: `${word} ` };
}

function isGiven(given: string[], name: string): boolean {
  return given.some((w) => w.startsWith(`${name}=`));
}

function paramItems(params: ParamDecl[], given: string[], word: string): Suggestion[] {
  const eq = word.indexOf("=");
  if (eq > 0) {
    const p = params.find((q) => q.key === word.slice(0, eq));
    return p?.type === "bool" ? ["true", "false"].map((v) => ({ label: `${p.key}=${v}`, insert: `${p.key}=${v} ` })) : [];
  }
  return params
    .filter((p) => !isGiven(given, p.key))
    .map((p) => ({ label: `${p.key}=`, insert: `${p.key}=`, detail: describeParam(p) }));
}

function describeParam(p: ParamDecl): string {
  if (p.type === "bool") return `bool, default ${p.default}`;
  const range = p.min !== undefined && p.max !== undefined ? ` ${p.min} to ${p.max}` : "";
  return `${p.type}${range}, default ${p.default}`;
}
