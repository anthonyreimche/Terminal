// The `// @` lines at the top of an effect's source: its params, and for a
// GLSL effect the phase it runs in.

import { tokenize } from "../words";
import type { EffectKind } from "./engines";

export type ParamDecl =
  | { key: string; type: "float" | "int"; min?: number; max?: number; default: number; label: string }
  | { key: string; type: "bool"; default: boolean; label: string };

export type Phase = "scene" | "display";

export interface HeaderError {
  line: number;
  message: string;
}

export type Header = { ok: true; phase: Phase; params: ParamDecl[] } | { ok: false; errors: HeaderError[] };

export const MAX_PARAMS = 16;
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
// Core renames a stage's uniforms wherever their key appears as a word, so a
// GLSL param must not share its name with anything else the code may say.
const GLSL_PARAM = /^[a-z][A-Za-z0-9]*$/;
const GLSL_NAMES = new Set(
  (
    "c lin src srcUv vUv uv main luma srgbToLinear linearToSrgb linearToSrgbU rgb2hsl hsl2rgb " +
    "attribute const uniform varying layout centroid flat smooth break continue do for while switch case default " +
    "if else in out inout float int uint void bool true false invariant discard return struct precision lowp mediump highp " +
    "vec2 vec3 vec4 ivec2 ivec3 ivec4 uvec2 uvec3 uvec4 bvec2 bvec3 bvec4 mat2 mat3 mat4 sampler2D sampler3D samplerCube " +
    "radians degrees sin cos tan asin acos atan sinh cosh tanh pow exp log exp2 log2 sqrt inversesqrt abs sign floor trunc " +
    "round roundEven ceil fract mod modf min max clamp mix step smoothstep isnan isinf length distance dot cross normalize " +
    "faceforward reflect refract matrixCompMult outerProduct transpose determinant inverse lessThan lessThanEqual " +
    "greaterThan greaterThanEqual equal notEqual any all not texture textureLod texelFetch textureSize dFdx dFdy fwidth"
  ).split(" "),
);

export function slugOf(name: string): string | null {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug && slug.length <= 40 ? slug : null;
}

export function parseHeader(source: string, kind: EffectKind): Header {
  const params: ParamDecl[] = [];
  const errors: HeaderError[] = [];
  let phase: Phase = "display";
  const lines = source.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].trim();
    if (text === "") continue;
    if (!text.startsWith("//")) break;
    const directive = /^\/\/\s*@(\S+)\s*(.*)$/.exec(text);
    if (!directive) continue;
    const fail = (message: string) => errors.push({ line: i + 1, message });
    const [, name, rest] = directive;
    if (name === "phase") {
      if (kind !== "glsl") fail("@phase is for GLSL effects");
      else if (rest.trim() === "scene" || rest.trim() === "display") phase = rest.trim() as Phase;
      else fail("phase must be scene or display");
    } else if (name === "param") {
      const parsed = parseParam(rest, params, kind);
      if (typeof parsed === "string") fail(parsed);
      else if (params.length >= MAX_PARAMS) fail(`at most ${MAX_PARAMS} params`);
      else params.push(parsed);
    } else {
      fail(`unknown directive @${name}`);
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, phase, params };
}

function parseParam(rest: string, earlier: readonly ParamDecl[], kind: EffectKind): ParamDecl | string {
  let words: string[];
  try {
    words = tokenize(rest);
  } catch (e) {
    return (e as Error).message;
  }
  const [key, type, ...more] = words;
  if (!key || !NAME.test(key)) return `"${key ?? ""}" isn't a name`;
  if (/^(fx_|gl_)/.test(key)) return "names starting fx_ or gl_ are reserved";
  if (kind === "glsl" && GLSL_NAMES.has(key)) return `"${key}" is a GLSL name; pick another`;
  if (kind === "glsl" && !GLSL_PARAM.test(key)) return "a GLSL param's name is letters and digits, starting with a small letter";
  if (earlier.some((p) => p.key === key)) return `"${key}" is declared twice`;
  if (type === "bool") {
    const [value, ...label] = more;
    if (value === undefined) return "needs a default";
    if (value !== "true" && value !== "false") return "a bool's default is true or false";
    return { key, type, default: value === "true", label: label.join(" ") || key };
  }
  if (type !== "float" && type !== "int") return "type must be float, int or bool";
  const numbers: number[] = [];
  while (numbers.length < 3 && more.length && isNumber(more[0])) numbers.push(Number(more.shift()));
  const label = more.join(" ") || key;
  if (numbers.length === 0) return "needs a default";
  if (numbers.length === 2) return "give min, max and default, or only a default";
  if (type === "int" && !numbers.every(Number.isInteger)) return "an int's values must be whole numbers";
  if (numbers.length === 1) return { key, type, default: numbers[0], label };
  const [min, max, value] = numbers;
  if (!(min < max)) return "min must be below max";
  if (value < min || value > max) return `default must be within ${min} to ${max}`;
  return { key, type, min, max, default: value, label };
}

function isNumber(word: string): boolean {
  return word.trim() !== "" && Number.isFinite(Number(word));
}

export type ParamValues = Record<string, number | boolean>;

/** Named arguments over the params' defaults, coerced to each param's type and
 *  clamped into its range. */
export function coerceParams(
  params: readonly ParamDecl[],
  given: Readonly<Record<string, string>>,
): { ok: true; values: ParamValues } | { ok: false; errors: string[] } {
  const values: ParamValues = {};
  const errors: string[] = [];
  for (const key of Object.keys(given)) if (!params.some((p) => p.key === key)) errors.push(`unknown param "${key}"`);
  for (const p of params) {
    const raw = given[p.key];
    if (raw === undefined) {
      values[p.key] = p.default;
    } else if (p.type === "bool") {
      if (raw === "true" || raw === "false") values[p.key] = raw === "true";
      else errors.push(`${p.key} must be true or false`);
    } else if (!isNumber(raw)) {
      errors.push(`${p.key} must be a number`);
    } else {
      let n = Number(raw);
      if (p.type === "int") n = Math.round(n);
      if (p.min !== undefined) n = Math.max(p.min, n);
      if (p.max !== undefined) n = Math.min(p.max, n);
      values[p.key] = n;
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, values };
}
