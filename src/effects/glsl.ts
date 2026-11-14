// A GLSL effect as a live processing stage. Its code edits `c`, a copy of the
// colour, which is mixed back in by the photo's Amount. The `if` skips it at
// Amount 0: dormancy only leaves the stage out of the live view, while
// thumbnails, exports and older photos run every stage, and mix(a, NaN, 0) is
// NaN.

import { EXTENSION_ID } from "../ids";
import type { ProcessingStageContribution, UniformDeclaration } from "../safelight";
import type { Header, HeaderError } from "./header";

export const AMOUNT = "fx_amount";

export function fxStageId(slug: string): string {
  return `${EXTENSION_ID}.fx.${slug}`;
}

export interface GlslEffect {
  name: string;
  slug: string;
  source: string;
}

/** The line of the stage's glsl the effect's first line lands on. */
export const BODY_LINE = 6;

export function buildStage(effect: GlslEffect, header: Extract<Header, { ok: true }>): ProcessingStageContribution {
  const v = header.phase === "scene" ? "lin" : "c";
  const glsl = [
    `if (${AMOUNT} > 0.0) {`,
    `vec3 fx_in = ${v};`,
    "vec3 fx_out;",
    "{",
    "vec3 c = fx_in;",
    effect.source,
    "fx_out = c;",
    "}",
    `${v} = mix(fx_in, fx_out, ${AMOUNT});`,
    "}",
  ].join("\n");
  const uniforms: UniformDeclaration[] = [
    { key: AMOUNT, glslType: "float", default: 0, range: { min: 0, max: 1, step: 0.01 }, label: "Amount" },
    ...header.params.map((p): UniformDeclaration => {
      if (p.type === "bool") return { key: p.key, glslType: "bool", default: p.default, label: p.label };
      const range = p.min !== undefined && p.max !== undefined ? { range: { min: p.min, max: p.max } } : {};
      return { key: p.key, glslType: p.type, default: p.default, ...range, label: p.label };
    }),
  ];
  return {
    id: fxStageId(effect.slug),
    name: effect.name,
    ...(header.phase === "scene" ? { phase: "scene-linear" as const } : { phase: "display-adjust" as const, space: { encoding: "perceptual" as const } }),
    presetScope: "global",
    dormantWhen: { [AMOUNT]: 0 },
    uniforms,
    glsl,
  };
}

/** Constructs that would break the develop program rather than the effect. */
export function checkBody(source: string): HeaderError[] {
  const errors: HeaderError[] = [];
  const code = stripComments(source).split("\n");
  code.forEach((text, i) => {
    const line = i + 1;
    if (/^\s*#/.test(text)) errors.push({ line, message: "# lines aren't allowed in an effect" });
    if (/\breturn\b/.test(text)) errors.push({ line, message: "return would end the whole program; set c instead" });
    if (/\bdiscard\b/.test(text)) errors.push({ line, message: "discard isn't allowed in an effect" });
  });
  return errors;
}

/** Blank out comments, keeping every newline so lines still count. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, " "));
}

// The helpers core documents for a stage's glsl, as stand-ins.
const HELPERS = `float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 srgbToLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c)); }
vec3 linearToSrgbU(vec3 c) { c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
vec3 linearToSrgb(vec3 c) { return clamp(linearToSrgbU(c), 0.0, 1.0); }`;

export interface CheckResult {
  errors: HeaderError[];
  warnings: HeaderError[];
}

/** Compile `fragment` and give its info log, or null when it compiled. */
export type Compile = (fragment: string) => string | null;

/** Compile the stage's block in a stand-in program, as far as one can: core
 *  gives a stage more helpers than the documented ones, so a name the
 *  stand-in doesn't know is only a warning. Lines are the effect's own (0 when
 *  the compiler names a line outside it). */
export function compileCheck(stage: ProcessingStageContribution, compile: Compile): CheckResult {
  const head = [
    "#version 300 es",
    "precision highp float;",
    ...stage.uniforms.map((u) => `uniform ${u.glslType} ${u.key};`),
    HELPERS,
    "out vec4 fx_frag;",
    "void main() {",
    "vec3 c = vec3(0.5);",
    "vec3 lin = c;",
  ].join("\n");
  const fragment = `${head}\n${stage.glsl}\nfx_frag = vec4(c + lin, 1.0);\n}\n`;
  const log = compile(fragment);
  const result: CheckResult = { errors: [], warnings: [] };
  if (!log) return result;
  const first = head.split("\n").length + BODY_LINE;
  const lines = stage.glsl.split("\n").length;
  const userLines = lines - (BODY_LINE - 1) - 4;
  for (const m of log.matchAll(/^ERROR:\s*\d+:(\d+):\s*(.*)$/gm)) {
    const at = Number(m[1]) - first + 1;
    const entry = { line: at >= 1 && at <= userLines ? at : 0, message: m[2].trim() };
    const unknownName = /undeclared identifier|no matching overloaded function/.test(entry.message);
    (unknownName ? result.warnings : result.errors).push(entry);
  }
  if (!result.errors.length && !result.warnings.length) result.errors.push({ line: 0, message: log.trim() });
  return result;
}

/** A Compile over a throwaway WebGL2 context, or null without WebGL2. */
export function webglCompiler(): Compile | null {
  if (typeof OffscreenCanvas === "undefined") return null;
  const gl = new OffscreenCanvas(1, 1).getContext("webgl2");
  if (!gl) return null;
  return (fragment) => {
    const shader = gl.createShader(gl.FRAGMENT_SHADER);
    if (!shader) return null;
    try {
      gl.shaderSource(shader, fragment);
      gl.compileShader(shader);
      return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? null : gl.getShaderInfoLog(shader) || "The shader didn't compile";
    } finally {
      gl.deleteShader(shader);
    }
  };
}
