// The person's effects and endpoints, kept in the extension's settings. Reads
// keep only well-formed records, so a hand-edited or older settings file
// can't break the console.

import { defaultEndpoint, type Endpoint, type ReplyAs, type SendAs, type SendFormat } from "./endpoints/endpoint";
import { isEffectKind, type EffectKind } from "./effects/engines";
import { slugOf } from "./effects/header";
import type { SafelightAPI } from "./safelight";

export interface EffectRecord {
  name: string;
  slug: string;
  kind: EffectKind;
  source: string;
}

type Settings = SafelightAPI["settings"];

export const EFFECTS_KEY = "effects";
export const ENDPOINTS_KEY = "endpoints";

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === "string";
const stringMap = (v: unknown): Record<string, string> =>
  isObject(v) ? Object.fromEntries(Object.entries(v).filter((e): e is [string, string] => isString(e[1]))) : {};

export function readEffects(settings: Settings): EffectRecord[] {
  const raw = settings.get<unknown>(EFFECTS_KEY, []);
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: EffectRecord[] = [];
  for (const r of raw) {
    if (!isObject(r) || !isString(r.name) || !isString(r.source) || !isEffectKind(r.kind)) continue;
    const slug = slugOf(r.name);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push({ name: r.name, slug, kind: r.kind, source: r.source });
  }
  return out;
}

export function writeEffects(settings: Settings, effects: readonly EffectRecord[]): void {
  settings.set(EFFECTS_KEY, effects.map(({ name, kind, source }) => ({ name, kind, source })));
}

const SEND: readonly SendAs[] = ["multipart", "body", "json-base64", "json-data-url"];
const REPLY: readonly ReplyAs[] = ["image", "json"];
const FORMATS: readonly SendFormat[] = ["image/jpeg", "image/png"];

export function normalizeEndpoint(r: unknown): Endpoint | null {
  if (!isObject(r) || !isString(r.name) || !isString(r.url)) return null;
  const base = defaultEndpoint(r.name, r.url);
  if (!base.slug) return null;
  const auth = r.auth === null ? null : isObject(r.auth) && isString(r.auth.header) ? { header: r.auth.header, prefix: isString(r.auth.prefix) ? r.auth.prefix : "" } : base.auth;
  return {
    ...base,
    method: r.method === "PUT" ? "PUT" : "POST",
    send: SEND.includes(r.send as SendAs) ? (r.send as SendAs) : base.send,
    field: isString(r.field) ? r.field : base.field,
    format: FORMATS.includes(r.format as SendFormat) ? (r.format as SendFormat) : base.format,
    longEdge: r.longEdge === null ? null : typeof r.longEdge === "number" && r.longEdge >= 16 ? Math.round(r.longEdge) : base.longEdge,
    quality: typeof r.quality === "number" ? Math.min(1, Math.max(0.1, r.quality)) : base.quality,
    fields: stringMap(r.fields),
    headers: stringMap(r.headers),
    auth,
    reply: REPLY.includes(r.reply as ReplyAs) ? (r.reply as ReplyAs) : base.reply,
    path: isString(r.path) ? r.path : "",
  };
}

export function readEndpoints(settings: Settings): Endpoint[] {
  const raw = settings.get<unknown>(ENDPOINTS_KEY, []);
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw.map(normalizeEndpoint).filter((e): e is Endpoint => !!e && !seen.has(e.slug) && !!seen.add(e.slug));
}

export function writeEndpoints(settings: Settings, endpoints: readonly Endpoint[]): void {
  settings.set(
    ENDPOINTS_KEY,
    endpoints.map(({ slug: _slug, ...rest }) => rest),
  );
}
