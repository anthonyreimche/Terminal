// Suggestions while writing an effect, for the word at the cursor: the @
// directives in the header, then the effect's own params and names, the
// helpers Safelight gives, and the language's builtins. Matched by the
// word's start; a word that starts with a digit gets none.

import type { Suggestion, Suggestions } from "../console/suggest";
import type { EffectKind } from "./engines";
import { parseHeader, type ParamDecl } from "./header";

type Kind = Exclude<EffectKind, "gmic">;

const named = (detail: string) => (label: string): Suggestion => ({ label, insert: label, detail });

const GLSL_HELPERS: Suggestion[] = [
  { label: "luma", insert: "luma", detail: "float luma(vec3 c) · Safelight" },
  { label: "srgbToLinear", insert: "srgbToLinear", detail: "vec3 srgbToLinear(vec3 c) · Safelight" },
  { label: "linearToSrgb", insert: "linearToSrgb", detail: "vec3 linearToSrgb(vec3 c), clips to 0–1 · Safelight" },
  { label: "linearToSrgbU", insert: "linearToSrgbU", detail: "vec3 linearToSrgbU(vec3 c), keeps values past 1 · Safelight" },
];

const GLSL_BUILTINS = (
  "abs acos asin atan ceil clamp cos cross degrees distance dot exp exp2 floor fract inversesqrt length log log2 " +
  "max min mix mod normalize pow radians reflect round sign sin smoothstep sqrt step tan"
)
  .split(" ")
  .map(named("GLSL"));

const GLSL_WORDS = "bool break const continue else false float for if int ivec2 ivec3 mat2 mat3 mat4 true vec2 vec3 vec4 while"
  .split(" ")
  .map(named("GLSL"));

const JS_HELPERS: Suggestion[] = [
  { label: "effect", insert: "effect", detail: "function effect(image, params): the image to import" },
  { label: "image", insert: "image", detail: "{ width, height, data }: RGBA floats, 0 to 1" },
  { label: "params", insert: "params", detail: "the @param values" },
  { label: "clamp", insert: "clamp", detail: "clamp(x, lo = 0, hi = 1)" },
  { label: "lerp", insert: "lerp", detail: "lerp(a, b, t)" },
  { label: "luma", insert: "luma", detail: "luma(r, g, b)" },
  { label: "toLinear", insert: "toLinear", detail: "toLinear(v): sRGB-encoded to linear" },
  { label: "toSrgb", insert: "toSrgb", detail: "toSrgb(v): linear to sRGB-encoded" },
  { label: "createImage", insert: "createImage", detail: "createImage(width, height): opaque black" },
  { label: "progress", insert: "progress", detail: "progress(fraction): shown in the Terminal" },
  { label: "log", insert: "log", detail: "log(...values): printed in the Terminal" },
];

const JS_WORDS = "async await break const continue else false Float32Array for function if let Math new return true while"
  .split(" ")
  .map(named("JavaScript"));

const MATH = "abs atan2 cbrt ceil cos exp floor hypot log log2 max min PI pow random round sign sin sqrt tan trunc"
  .split(" ")
  .map(named("Math"));

const IMAGE_FIELDS: Suggestion[] = [
  { label: "width", insert: "width", detail: "pixels" },
  { label: "height", insert: "height", detail: "pixels" },
  { label: "data", insert: "data", detail: "Float32Array, RGBA, rows from the top" },
];

const DIRECTIVES: Record<Kind, Suggestion[]> = {
  glsl: [
    { label: "@param", insert: "@param ", detail: "@param <name> <float|int|bool> [min max] <default> [label]" },
    { label: "@phase", insert: "@phase ", detail: "@phase scene|display" },
  ],
  js: [{ label: "@param", insert: "@param ", detail: "@param <name> <float|int|bool> [min max] <default> [label]" }],
};

const TYPES = ["float", "int", "bool"].map((t) => ({ label: t, insert: `${t} ` }));
const PHASES: Suggestion[] = [
  { label: "scene", insert: "scene", detail: "linear light, before the display transform" },
  { label: "display", insert: "display", detail: "display-encoded (the default)" },
];

const WORD = /[A-Za-z0-9_$]/;

export function suggestCode(source: string, cursor: number, kind: Kind): Suggestions {
  const lineStart = source.lastIndexOf("\n", cursor - 1) + 1;
  const lineBefore = source.slice(lineStart, cursor);
  let from = cursor;
  while (from > lineStart && (WORD.test(source[from - 1]) || source[from - 1] === "@")) from--;
  let to = cursor;
  while (to < source.length && WORD.test(source[to])) to++;
  const word = source.slice(from, cursor);
  const result = (items: Suggestion[]): Suggestions => {
    const w = word.toLowerCase();
    const matched = items.filter((i) => i.label.toLowerCase().startsWith(w) && i.label !== word);
    return { from, to, items: matched };
  };

  if (/^\s*\/\//.test(lineBefore)) {
    if (/^\s*\/\/\s*@\w*$/.test(lineBefore)) return result(DIRECTIVES[kind]);
    if (kind === "glsl" && /^\s*\/\/\s*@phase\s+\w*$/.test(lineBefore)) return result(PHASES);
    if (/^\s*\/\/\s*@param\s+\w+\s+\w*$/.test(lineBefore)) return result(TYPES);
    return result([]);
  }
  if (/^[0-9]/.test(word)) return result([]);

  const header = parseHeader(source, kind);
  const params = header.ok ? header.params : [];
  if (source[from - 1] === ".") {
    if (kind !== "js") return result([]);
    const object = /([A-Za-z_$][\w$]*)\.$/.exec(source.slice(lineStart, from))?.[1];
    if (object === "params") return result(params.map(paramItem));
    if (object === "image") return result(IMAGE_FIELDS);
    if (object === "Math") return result(MATH);
    return result([]);
  }
  if (!word) return result([]);

  const declared = kind === "glsl"
    ? /\b(?:float|int|bool|vec[234]|ivec[234]|mat[234])\s+([A-Za-z_]\w*)/g
    : /\b(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)/g;
  const locals = [...new Set([...source.matchAll(declared)].map((m) => m[1]))].map(named("declared here"));
  const own = [...params.map(paramItem), ...locals];
  const language = kind === "glsl"
    ? [{ label: "c", insert: "c", detail: "vec3, the colour" }, ...GLSL_HELPERS, ...GLSL_BUILTINS, ...GLSL_WORDS]
    : [...JS_HELPERS, ...JS_WORDS];
  const seen = new Set<string>();
  return result([...own, ...language].filter((i) => !seen.has(i.label) && !!seen.add(i.label)));
}

/** The source with `item` in place of the word, and where the cursor goes. */
export function applyCode(source: string, s: Suggestions, item: Suggestion): { text: string; cursor: number } {
  return { text: source.slice(0, s.from) + item.insert + source.slice(s.to), cursor: s.from + item.insert.length };
}

function paramItem(p: ParamDecl): Suggestion {
  const range = p.type !== "bool" && p.min !== undefined && p.max !== undefined ? `, ${p.min} to ${p.max}` : "";
  return { label: p.key, insert: p.key, detail: `${p.type} param${range}` };
}
