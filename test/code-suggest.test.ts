// Suggestions while writing an effect: the language's names, the helpers
// Safelight gives, the effect's own params and names, and the @ directives.

import { describe, expect, it } from "vitest";
import { applyCode, suggestCode } from "../src/effects/code-suggest";

const at = (src: string, kind: "glsl" | "js" = "glsl") => {
  const cursor = src.indexOf("|");
  return suggestCode(src.replace("|", ""), cursor, kind);
};
const labels = (src: string, kind: "glsl" | "js" = "glsl") => at(src, kind).items.map((i) => i.label);

describe("suggestCode, GLSL", () => {
  it("offers helpers and builtins by the word's start, with what they take", () => {
    expect(labels("c = mi|")).toEqual(["min", "mix"]);
    expect(at("c = lum|").items[0]).toEqual({ label: "luma", insert: "luma", detail: "float luma(vec3 c) · Safelight" });
  });

  it("offers the effect's params and the names it declares", () => {
    const src = "// @param warmth float -1 1 0 Warmth\nfloat wobble = 1.0;\nc *= w|";
    expect(labels(src)).toEqual(["warmth", "wobble", "while"]);
    expect(at(src).items[0].detail).toBe("float param, -1 to 1");
  });

  it("offers nothing for a word that is only a number, or before anything is typed", () => {
    expect(labels("c *= 1|")).toEqual([]);
    expect(labels("c *= |")).toEqual([]);
  });

  it("offers nothing after a dot (swizzles) or inside a plain comment", () => {
    expect(labels("c.r|")).toEqual([]);
    expect(labels("// make it mi|")).toEqual([]);
  });

  it("offers the directives after // @, the types after a param's name and the phases after @phase", () => {
    expect(labels("// @|")).toEqual(["@param", "@phase"]);
    expect(labels("// @param gain |")).toEqual(["float", "int", "bool"]);
    expect(labels("// @phase s|")).toEqual(["scene"]);
  });

  it("replaces the whole word around the cursor", () => {
    const s = at("c = mi|xx;");
    expect(s).toMatchObject({ from: 4, to: 8 });
    expect(applyCode("c = mixx;", s, s.items.find((i) => i.label === "mix")!)).toEqual({ text: "c = mix;", cursor: 7 });
  });
});

describe("suggestCode, JavaScript", () => {
  it("offers the helpers and the effect's names, not GLSL's", () => {
    expect(labels("const data = 1;\nfunction effect(image) { return cre|", "js")).toEqual(["createImage"]);
    expect(labels("d|", "js")).toEqual([]);
    expect(labels("const data = 1;\nda|", "js")).toEqual(["data"]);
  });

  it("offers the params after params., the image's fields after image., and Math's after Math.", () => {
    const src = "// @param levels int 2 16 4\nfunction effect(image, params) { params.|";
    expect(labels(src, "js")).toEqual(["levels"]);
    expect(labels("image.w|", "js")).toEqual(["width"]);
    expect(labels("Math.ro|", "js")).toEqual(["round"]);
  });

  it("offers @param but not @phase in a JS effect", () => {
    expect(labels("// @p|", "js")).toEqual(["@param"]);
  });
});
