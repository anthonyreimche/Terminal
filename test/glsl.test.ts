// A GLSL effect becomes a live processing stage: its code runs on a copy of
// the colour, mixed back in by the photo's Amount, and skipped at Amount 0.

import { describe, expect, it, vi } from "vitest";
import { BODY_LINE, buildStage, checkBody, compileCheck, fxStageId } from "../src/effects/glsl";
import type { Header } from "../src/effects/header";

const header = (h: Partial<Extract<Header, { ok: true }>> = {}): Extract<Header, { ok: true }> => ({
  ok: true,
  phase: "display",
  params: [],
  ...h,
});

describe("buildStage", () => {
  it("names the stage under the extension and wraps the code in a display-adjust block", () => {
    const stage = buildStage({ name: "Warm Fade", slug: "warm-fade", source: "c *= 1.1;" }, header());
    expect(stage).toEqual({
      id: "terminal.fx.warm-fade",
      name: "Warm Fade",
      phase: "display-adjust",
      space: { encoding: "perceptual" },
      presetScope: "global",
      dormantWhen: { fx_amount: 0 },
      uniforms: [{ key: "fx_amount", glslType: "float", default: 0, range: { min: 0, max: 1, step: 0.01 }, label: "Amount" }],
      glsl: [
        "if (fx_amount > 0.0) {",
        "vec3 fx_in = c;",
        "vec3 fx_out;",
        "{",
        "vec3 c = fx_in;",
        "c *= 1.1;",
        "fx_out = c;",
        "}",
        "c = mix(fx_in, fx_out, fx_amount);",
        "}",
      ].join("\n"),
    });
    expect(stage.glsl.split("\n")[BODY_LINE - 1]).toBe("c *= 1.1;");
  });

  it("runs a scene effect on linear light", () => {
    const stage = buildStage({ name: "L", slug: "l", source: "c *= 2.0;" }, header({ phase: "scene" }));
    expect(stage.phase).toBe("scene-linear");
    expect(stage.space).toBeUndefined();
    expect(stage.glsl).toContain("vec3 fx_in = lin;");
    expect(stage.glsl).toContain("lin = mix(fx_in, fx_out, fx_amount);");
  });

  it("declares the params as uniforms after Amount", () => {
    const stage = buildStage(
      { name: "P", slug: "p", source: "" },
      header({
        params: [
          { key: "gain", type: "float", min: 0, max: 2, default: 1, label: "Gain" },
          { key: "steps", type: "int", default: 3, label: "steps" },
          { key: "mono", type: "bool", default: true, label: "Mono" },
        ],
      }),
    );
    expect(stage.uniforms.slice(1)).toEqual([
      { key: "gain", glslType: "float", default: 1, range: { min: 0, max: 2 }, label: "Gain" },
      { key: "steps", glslType: "int", default: 3, label: "steps" },
      { key: "mono", glslType: "bool", default: true, label: "Mono" },
    ]);
  });

  it("ends the user's code on a line of its own, so a trailing comment can't swallow the wrapper", () => {
    const stage = buildStage({ name: "P", slug: "p", source: "c *= 2.0; // done" }, header());
    expect(stage.glsl).toContain("c *= 2.0; // done\nfx_out = c;");
  });

  it("names stages by slug", () => {
    expect(fxStageId("a-b")).toBe("terminal.fx.a-b");
  });
});

describe("checkBody", () => {
  it("refuses return, discard and preprocessor lines, with their lines", () => {
    expect(checkBody("c *= 2.0;\nif (c.r > 1.0) return;\n#define X 1\ndiscard;")).toEqual([
      { line: 2, message: "return would end the whole program; set c instead" },
      { line: 3, message: "# lines aren't allowed in an effect" },
      { line: 4, message: "discard isn't allowed in an effect" },
    ]);
  });

  it("ignores the words inside comments", () => {
    expect(checkBody("// return the colour\nc = c; /* discard */")).toEqual([]);
  });
});

describe("compileCheck", () => {
  const stage = buildStage(
    { name: "P", slug: "p", source: "// @param gain float 1\nc *= gain;" },
    header({ params: [{ key: "gain", type: "float", default: 1, label: "gain" }] }),
  );

  it("compiles the block with its uniforms and the documented helpers declared", () => {
    const compile = vi.fn((_src: string): string | null => null);
    expect(compileCheck(stage, compile)).toEqual({ errors: [], warnings: [] });
    const src = compile.mock.calls[0][0];
    expect(src.startsWith("#version 300 es")).toBe(true);
    for (const decl of ["uniform float fx_amount;", "uniform float gain;", "float luma(vec3", "vec3 srgbToLinear(vec3", "vec3 linearToSrgb(vec3", "vec3 linearToSrgbU(vec3"]) {
      expect(src).toContain(decl);
    }
    expect(src).toContain(stage.glsl);
  });

  it("maps the compiler's lines to the effect's source", () => {
    let offset = 0;
    const compile = (src: string) => {
      offset = src.split("\n").indexOf("c *= gain;") + 1;
      return `ERROR: 0:${offset}: 'x' : syntax error\nERROR: 0:${offset + 40}: far away\n`;
    };
    const result = compileCheck(stage, compile);
    expect(result.errors).toEqual([
      { line: 2, message: "'x' : syntax error" },
      { line: 0, message: "far away" },
    ]);
  });

  it("takes a name the stand-in doesn't declare as a warning, since core has more helpers", () => {
    const compile = (src: string) => {
      const line = src.split("\n").indexOf("c *= gain;") + 1;
      return `ERROR: 0:${line}: 'rgb2hsl' : no matching overloaded function found\nERROR: 0:${line}: 'q' : undeclared identifier\n`;
    };
    expect(compileCheck(stage, compile)).toEqual({
      errors: [],
      warnings: [
        { line: 2, message: "'rgb2hsl' : no matching overloaded function found" },
        { line: 2, message: "'q' : undeclared identifier" },
      ],
    });
  });
});
