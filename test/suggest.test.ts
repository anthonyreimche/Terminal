// Suggestions for the word at the prompt's cursor, from the command grammar
// and the person's own effects, endpoints and develop values.

import { describe, expect, it } from "vitest";
import { applySuggestion, suggestLine, type LineSource } from "../src/console/suggest";
import type { CommandTable } from "../src/console/terminal";
import { defaultEndpoint } from "../src/endpoints/endpoint";
import { ENGINES } from "../src/effects/engines";

const cmd = (summary: string, subcommands?: string[]) => ({ summary, usage: "", subcommands, run: () => {} });
const commands: CommandTable = {
  photos: cmd("the photos"),
  params: cmd("develop values"),
  get: cmd("read a value"),
  set: cmd("change values"),
  fx: cmd("effects", ["list", "new", "edit", "rm", "apply", "off"]),
  run: cmd("run a script"),
  api: cmd("imaging APIs", ["list", "new", "edit", "rm", "key", "send"]),
};

const source: LineSource = {
  commands,
  effects: () => [
    { name: "Warm", slug: "warm", kind: "glsl", source: ENGINES.glsl.template },
    { name: "Posterize", slug: "posterize", kind: "js", source: "// @param levels int 2 16 4 Levels\n// @param mono bool false\nfunction effect(i) { return i; }" },
  ],
  endpoints: () => [
    { ...defaultEndpoint("Upscale", "https://api.example.com/{{model}}?n={{filename}}"), fields: { scale: "{{scale}}" }, headers: { "X-Seed": "{{ seed }}" } },
  ],
  developKeys: () => [
    { key: "exposure", label: "Exposure", kind: "number" },
    { key: "vignette.amount", label: "Effects: Vignette", kind: "number" },
    { key: "terminal.fx.warm.fx_amount", label: "Warm: Amount", kind: "number" },
    { key: "autoTone", label: "autoTone", kind: "boolean" },
  ],
};

const labels = (text: string, cursor = text.length) => suggestLine(text, cursor, source).items.map((i) => i.label);

describe("suggestLine", () => {
  it("offers the commands for the first word, matching the start first", () => {
    expect(labels("")).toEqual([]);
    expect(labels("p")).toEqual(["photos", "params", "api", "help"]);
    expect(suggestLine("p", 1, source).items[0]).toEqual({ label: "photos", insert: "photos ", detail: "the photos" });
  });

  it("matches anywhere in a word after the matches at its start, ignoring case", () => {
    expect(labels("ET")).toEqual(["get", "set"]);
  });

  it("offers subcommands as soon as a command is followed by a space", () => {
    expect(labels("fx ")).toEqual(["list", "new", "edit", "rm", "apply", "off"]);
    expect(labels("api s")).toEqual(["send", "list"]);
  });

  it("offers the effects a subcommand takes", () => {
    expect(labels("fx edit ")).toEqual(["warm", "posterize"]);
    expect(labels("fx apply ")).toEqual(["warm"]);
    expect(labels("run ")).toEqual(["posterize"]);
  });

  it("offers the flags of fx new after the name, without repeats", () => {
    expect(labels("fx new glow ")).toEqual(["--glsl", "--js"]);
    expect(labels("fx new glow --js --")).toEqual(["--glsl"]);
  });

  it("offers a script's params as name=, with their type and range", () => {
    const items = suggestLine("run posterize ", 14, source).items;
    expect(items).toEqual([
      { label: "levels=", insert: "levels=", detail: "int 2 to 16, default 4" },
      { label: "mono=", insert: "mono=", detail: "bool, default false" },
    ]);
    expect(labels("run posterize levels=3 ")).toEqual(["mono="]);
  });

  it("offers true and false for a bool param after its =", () => {
    expect(labels("run posterize mono=")).toEqual(["mono=true", "mono=false"]);
    expect(labels("run posterize mono=t")).toEqual(["mono=true"]);
  });

  it("offers the endpoints, then their placeholders but the photo's name", () => {
    expect(labels("api send ")).toEqual(["upscale"]);
    expect(labels("api send upscale ")).toEqual(["model=", "scale=", "seed="]);
    expect(labels("api send upscale scale=2 m")).toEqual(["model="]);
  });

  it("offers develop keys where set takes a key, and true or false for a boolean's value", () => {
    expect(labels("get vig")).toEqual(["vignette.amount"]);
    expect(labels("set exposure 1 auto")).toEqual(["autoTone"]);
    expect(labels("set autoTone ")).toEqual(["true", "false"]);
    expect(labels("set exposure ")).toEqual([]);
  });

  it("offers the commands to help", () => {
    expect(labels("help a")).toEqual(["api", "params"]);
  });

  it("offers nothing once the only match is what is typed", () => {
    expect(labels("photos")).toEqual([]);
  });

  it("works on the word at the cursor, not the end of the line", () => {
    const s = suggestLine("fx ap warm", 5, source);
    expect(s).toMatchObject({ from: 3, to: 5 });
    expect(s.items.map((i) => i.label)).toEqual(["apply"]);
  });
});

describe("applySuggestion", () => {
  it("replaces the word at the cursor and puts the cursor after it", () => {
    const s = suggestLine("fx ap warm", 5, source);
    expect(applySuggestion("fx ap warm", s, s.items[0])).toEqual({ text: "fx apply warm", cursor: 9 });
  });

  it("leaves the cursor right after an = so the value can be typed", () => {
    const s = suggestLine("run posterize l", 15, source);
    expect(applySuggestion("run posterize l", s, s.items[0])).toEqual({ text: "run posterize levels=", cursor: 21 });
  });
});
