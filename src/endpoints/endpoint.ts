// An imaging API the person set up: where a photo goes, how it is packed, the
// key that goes with it, and where the answer's image is. Requests go through
// api.network.fetch, which takes a string or bytes, so multipart bodies are
// packed here.

import { slugOf } from "../effects/header";

export type SendAs = "multipart" | "body" | "json-base64" | "json-data-url";
export type ReplyAs = "image" | "json";
export type SendFormat = "image/jpeg" | "image/png";

export interface Endpoint {
  name: string;
  slug: string;
  url: string;
  method: "POST" | "PUT";
  send: SendAs;
  /** The image's multipart field, or its key in the JSON body (dots nest). */
  field: string;
  format: SendFormat;
  /** Long edge of the image sent, in pixels; null for the original size. */
  longEdge: number | null;
  /** JPEG quality, 0 to 1. */
  quality: number;
  fields: Record<string, string>;
  headers: Record<string, string>;
  auth: { header: string; prefix: string } | null;
  reply: ReplyAs;
  /** Where the image is in a JSON answer, dot separated ("output.0.url"). */
  path: string;
}

export function defaultEndpoint(name: string, url: string): Endpoint {
  return {
    name,
    slug: slugOf(name) ?? "",
    url,
    method: "POST",
    send: "multipart",
    field: "image",
    format: "image/jpeg",
    longEdge: 2048,
    quality: 0.92,
    fields: {},
    headers: {},
    auth: { header: "Authorization", prefix: "Bearer " },
    reply: "image",
    path: "",
  };
}

const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

export function validateEndpoint(ep: Endpoint): string[] {
  const errors: string[] = [];
  if (!ep.slug) errors.push("Give the endpoint a name with letters or digits");
  if (!/^https?:\/\/[^/\s]+/i.test(ep.url.trim())) errors.push("The address must start with http:// or https://");
  if (!ep.field.trim() && ep.send !== "body") errors.push("Name the field the image goes in");
  if (ep.reply === "json" && !ep.path.trim()) errors.push("Say where the image is in the JSON answer");
  for (const name of [...Object.keys(ep.headers), ...(ep.auth ? [ep.auth.header] : [])]) {
    if (!HEADER_NAME.test(name)) errors.push(`"${name}" isn't a header name`);
  }
  if (ep.longEdge !== null && !(Number.isInteger(ep.longEdge) && ep.longEdge >= 16)) errors.push("The size must be 16 px or more");
  for (const path of [ep.field, ...Object.keys(ep.fields)]) if (unsafePath(path)) errors.push(`"${path}" can't name __proto__, constructor or prototype`);
  return errors;
}

const UNSAFE = new Set(["__proto__", "constructor", "prototype"]);
const unsafePath = (path: string) => path.split(".").some((name) => UNSAFE.has(name));

const PLACEHOLDER = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

export function fillPlaceholders(
  text: string,
  values: Readonly<Record<string, string>>,
): { ok: true; text: string } | { ok: false; missing: string[] } {
  const missing: string[] = [];
  const filled = text.replace(PLACEHOLDER, (whole, name: string) => {
    if (Object.hasOwn(values, name)) return values[name];
    if (!missing.includes(name)) missing.push(name);
    return whole;
  });
  return missing.length ? { ok: false, missing } : { ok: true, text: filled };
}

export interface SendImage {
  bytes: Uint8Array;
  type: string;
}

export interface BuiltRequest {
  url: string;
  init: { method: "POST" | "PUT"; headers: Record<string, string>; body: string | Uint8Array };
}

export function buildRequest(
  ep: Endpoint,
  image: SendImage,
  values: Readonly<Record<string, string>>,
  key: string | null,
): ({ ok: true } & BuiltRequest) | { ok: false; error: string } {
  const missing: string[] = [];
  const fill = (text: string, encode = false) => {
    const r = fillPlaceholders(text, encode ? encodedValues(values) : values);
    if (r.ok) return r.text;
    for (const name of r.missing) if (!missing.includes(name)) missing.push(name);
    return text;
  };
  const url = fill(ep.url.trim(), true);
  const fields = Object.entries(ep.fields).map(([name, value]) => [name, fill(value)] as const);
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(ep.headers)) headers[name] = fill(value);
  if (missing.length) return { ok: false, error: `Give a value for ${missing.join(", ")} (e.g. ${missing[0]}=…)` };
  if (ep.auth && !key) return { ok: false, error: `No key for ${ep.name}. Set one with: api key ${ep.slug}` };
  if (ep.send !== "multipart" && ep.send !== "body" && [ep.field, ...fields.map(([n]) => n)].some(unsafePath)) {
    return { ok: false, error: "A JSON key can't name __proto__, constructor or prototype" };
  }

  let body: string | Uint8Array;
  if (ep.send === "body") {
    if (!hasHeader(headers, "Content-Type")) headers["Content-Type"] = image.type;
    body = image.bytes;
  } else if (ep.send === "multipart") {
    const boundary = `----SafelightTerminal${randomHex()}`;
    setHeader(headers, "Content-Type", `multipart/form-data; boundary=${boundary}`);
    body = multipart(boundary, fields, ep.field, fileName(values.filename, image.type), image);
  } else {
    const json: Record<string, unknown> = {};
    for (const [name, value] of fields) setPath(json, name, value);
    const b64 = base64(image.bytes);
    setPath(json, ep.field, ep.send === "json-data-url" ? `data:${image.type};base64,${b64}` : b64);
    setHeader(headers, "Content-Type", "application/json");
    body = JSON.stringify(json);
  }
  if (ep.auth && key) setHeader(headers, ep.auth.header, `${ep.auth.prefix}${key}`);
  return { ok: true, url, init: { method: ep.method, headers, body } };
}

function encodedValues(values: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).map(([k, v]) => [k, encodeURIComponent(v)]));
}

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

function hasHeader(headers: Record<string, string>, name: string): boolean {
  return Object.keys(headers).some((k) => sameName(k, name));
}

/** Set a header, dropping any other spelling of its name. */
function setHeader(headers: Record<string, string>, name: string, value: string): void {
  for (const k of Object.keys(headers)) if (sameName(k, name)) delete headers[k];
  headers[name] = value;
}

function multipart(
  boundary: string,
  fields: ReadonlyArray<readonly [string, string]>,
  field: string,
  filename: string,
  image: SendImage,
): Uint8Array {
  const encoder = new TextEncoder();
  let head = "";
  for (const [name, value] of fields) {
    head += `--${boundary}\r\nContent-Disposition: form-data; name="${quoted(name)}"\r\n\r\n${value}\r\n`;
  }
  head +=
    `--${boundary}\r\nContent-Disposition: form-data; name="${quoted(field)}"; filename="${quoted(filename)}"\r\n` +
    `Content-Type: ${image.type}\r\n\r\n`;
  const parts = [encoder.encode(head), image.bytes, encoder.encode(`\r\n--${boundary}--\r\n`)];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function quoted(text: string): string {
  return text.replace(/["\r\n\\]/g, "_");
}

function fileName(original: string | undefined, type: string): string {
  const base = (original ?? "photo").replace(/\.[^./\\]*$/, "") || "photo";
  return `${base}.${extensionOf(type)}`;
}

export function extensionOf(type: string): string {
  switch (type) {
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/tiff":
      return "tif";
    case "image/avif":
      return "avif";
    case "image/gif":
      return "gif";
    default:
      return "png";
  }
}

function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const names = path.split(".");
  let at = target;
  for (const name of names.slice(0, -1)) {
    const next = at[name];
    at = (at[name] = typeof next === "object" && next !== null ? next : {}) as Record<string, unknown>;
  }
  at[names[names.length - 1]] = value;
}

function randomHex(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function base64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array | null {
  try {
    const binary = atob(text.replace(/\s+/g, ""));
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** The image type of `bytes` from its first bytes, or null. */
export function sniffImage(bytes: Uint8Array): string | null {
  const at = (i: number, ...values: number[]) => values.every((v, k) => bytes[i + k] === v);
  const ascii = (i: number, text: string) => at(i, ...[...text].map((ch) => ch.charCodeAt(0)));
  if (at(0, 0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (ascii(0, "RIFF") && ascii(8, "WEBP")) return "image/webp";
  if (ascii(0, "GIF8")) return "image/gif";
  if (at(0, 0x49, 0x49, 0x2a, 0x00) || at(0, 0x4d, 0x4d, 0x00, 0x2a)) return "image/tiff";
  if (ascii(4, "ftypavif") || ascii(4, "ftypavis")) return "image/avif";
  return null;
}

export type Reply =
  | { kind: "image"; bytes: Uint8Array; type: string }
  | { kind: "url"; url: string }
  | { kind: "error"; error: string };

const BODY_SHOWN = 300;

export async function readReply(ep: Endpoint, res: Response): Promise<Reply> {
  if (!res.ok) {
    const text = (await res.text().catch(() => "")).trim();
    const shown = text.length > BODY_SHOWN ? `${text.slice(0, BODY_SHOWN)}…` : text;
    const status = `${res.status}${res.statusText ? ` ${res.statusText}` : ""}`;
    return { kind: "error", error: `The service answered ${status}${shown ? `: ${shown}` : ""}` };
  }
  const contentType = (res.headers.get("Content-Type") ?? "").split(";")[0].trim().toLowerCase();
  if (ep.reply === "image") return imageReply(new Uint8Array(await res.arrayBuffer()), contentType);

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { kind: "error", error: "The answer isn't JSON" };
  }
  const path = ep.path.trim();
  const value = path
    .split(".")
    .reduce<unknown>((at, name) => (typeof at === "object" && at !== null && Object.hasOwn(at, name) ? (at as Record<string, unknown>)[name] : undefined), json);
  if (typeof value !== "string" || !value) return { kind: "error", error: `The answer has no text at ${path}` };
  if (/^https?:\/\//i.test(value)) return { kind: "url", url: value };
  const dataUrl = /^data:([^;,]+)(?:;[^,]*)?;base64,(.*)$/s.exec(value);
  const bytes = fromBase64(dataUrl ? dataUrl[2] : value);
  if (!bytes) return { kind: "error", error: `The text at ${path} is neither an address nor base64` };
  const type = dataUrl ? dataUrl[1].toLowerCase() : "";
  return imageReply(bytes, type);
}

/** An image answer, typed by its bytes: a declared type can be wrong, and the
 *  imported file is named by it. */
export function imageReply(bytes: Uint8Array, contentType: string): Reply {
  const sniffed = sniffImage(bytes);
  if (sniffed) return { kind: "image", bytes, type: sniffed };
  return { kind: "error", error: `The answer isn't an image${contentType ? ` (${contentType})` : ""}` };
}
