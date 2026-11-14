// An effect's source starts with `// @` lines that declare its params (both
// kinds) and, for GLSL, the phase it runs in.

import { describe, expect, it } from "vitest";
import { coerceParams, parseHeader, slugOf } from "../src/effects/header";

describe("slugOf", () => {
  it("lower-cases and joins runs of other characters with -", () => {
    expect(slugOf("  Warm Film #2! ")).toBe("warm-film-2");
  });

  it("gives null for a name with no letters or digits, or over 40 characters", () => {
    expect(slugOf("!!!")).toBeNull();
    expect(slugOf("a".repeat(41))).toBeNull();
    expect(slugOf("a".repeat(40))).toBe("a".repeat(40));
  });
});

describe("parseHeader", () => {
  it("reads float, int and bool params with ranges and labels", () => {
    const src = [
      `// @param amount float 0 1 0.5 "Strength of it"`,
      "// @param levels int 2 16 4 Levels",
      "// @param mono bool false Monochrome",
      "c = c;",
    ].join("\n");
    expect(parseHeader(src, "glsl")).toEqual({
      ok: true,
      phase: "display",
      params: [
        { key: "amount", type: "float", min: 0, max: 1, default: 0.5, label: "Strength of it" },
        { key: "levels", type: "int", min: 2, max: 16, default: 4, label: "Levels" },
        { key: "mono", type: "bool", default: false, label: "Monochrome" },
      ],
    });
  });

  it("labels a param by its key when no label is given, and ranges are optional", () => {
    const r = parseHeader("// @param gain float 1.5", "js");
    expect(r).toEqual({ ok: true, phase: "display", params: [{ key: "gain", type: "float", default: 1.5, label: "gain" }] });
  });

  it("reads the phase of a GLSL effect", () => {
    expect(parseHeader("// @phase scene", "glsl")).toMatchObject({ ok: true, phase: "scene" });
  });

  it("stops at the first line that isn't a comment", () => {
    const r = parseHeader("// @param a float 1\nfloat x;\n// @param b float 2", "glsl");
    expect(r.ok && r.params.map((p) => p.key)).toEqual(["a"]);
  });

  it("skips blank lines and plain comments in the header", () => {
    const r = parseHeader("// A warm look\n\n// @param a float 1", "glsl");
    expect(r.ok && r.params.map((p) => p.key)).toEqual(["a"]);
  });

  it.each([
    ["// @param 1x float 1", 1, "\"1x\" isn't a name"],
    ["// @param fx_a float 1", 1, "names starting fx_ or gl_ are reserved"],
    ["// @param gl_a float 1", 1, "names starting fx_ or gl_ are reserved"],
    ["// @param a vec3 1", 1, "type must be float, int or bool"],
    ["// @param a float", 1, "needs a default"],
    ["// @param a float 1 0 0.5", 1, "min must be below max"],
    ["// @param a float 0 1 2", 1, "default must be within 0 to 1"],
    ["// @param a int 0 4 1.5", 1, "an int's values must be whole numbers"],
    ["// @param a bool yes", 1, "a bool's default is true or false"],
    ["// @param a float 1\n// @param a float 2", 2, "\"a\" is declared twice"],
    ["// @phase linear", 1, "phase must be scene or display"],
    ["// @colour red", 1, "unknown directive @colour"],
    ["// @param mix float 1", 1, "\"mix\" is a GLSL name; pick another"],
    ["// @param c float 1", 1, "\"c\" is a GLSL name; pick another"],
    ["// @param my_amount float 1", 1, "a GLSL param's name is letters and digits, starting with a small letter"],
  ])("refuses %j at line %i: %s", (src, line, message) => {
    expect(parseHeader(src, "glsl")).toEqual({ ok: false, errors: [{ line, message }] });
  });

  it("lets a JS effect's params use any identifier", () => {
    expect(parseHeader("// @param mix float 1\n// @param my_amount float 1", "js")).toMatchObject({ ok: true });
  });

  it("refuses @phase in a JS effect", () => {
    expect(parseHeader("// @phase scene", "js")).toEqual({
      ok: false,
      errors: [{ line: 1, message: "@phase is for GLSL effects" }],
    });
  });

  it("refuses more than 16 params", () => {
    const src = Array.from({ length: 17 }, (_, i) => `// @param p${i} float 0`).join("\n");
    expect(parseHeader(src, "glsl")).toEqual({ ok: false, errors: [{ line: 17, message: "at most 16 params" }] });
  });

  it("reports every bad line", () => {
    const r = parseHeader("// @param a\n// @param b float 1\n// @nope", "glsl");
    expect(r.ok ? [] : r.errors.map((e) => e.line)).toEqual([1, 3]);
  });
});

describe("coerceParams", () => {
  const params = [
    { key: "amount", type: "float", min: 0, max: 1, default: 0.5, label: "amount" },
    { key: "levels", type: "int", min: 2, max: 16, default: 4, label: "levels" },
    { key: "mono", type: "bool", default: false, label: "mono" },
  ] as const;

  it("fills the defaults and takes given values, coerced and clamped", () => {
    expect(coerceParams(params, { amount: "3", levels: "7.6", mono: "true" })).toEqual({
      ok: true,
      values: { amount: 1, levels: 8, mono: true },
    });
  });

  it("refuses an unknown key, a non-number and a non-bool", () => {
    expect(coerceParams(params, { x: "1", amount: "lots", mono: "maybe" })).toEqual({
      ok: false,
      errors: ["unknown param \"x\"", "amount must be a number", "mono must be true or false"],
    });
  });
});
