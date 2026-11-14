// A command line splits into words the way a shell does, and the words into
// positional arguments, k=v named arguments and --flags.

import { describe, expect, it } from "vitest";
import { parseArgs, tokenize } from "../src/words";

describe("tokenize", () => {
  it("splits on runs of whitespace", () => {
    expect(tokenize("  fx   apply\tfade  ")).toEqual(["fx", "apply", "fade"]);
  });

  it("keeps quoted text as one word, without the quotes", () => {
    expect(tokenize(`api send up prompt="a red barn" note='it''s'`)).toEqual([
      "api",
      "send",
      "up",
      "prompt=a red barn",
      "note=its",
    ]);
  });

  it("joins quoted and bare parts touching each other", () => {
    expect(tokenize(`a"b c"d`)).toEqual(["ab cd"]);
  });

  it("takes a backslash's next character literally, outside single quotes", () => {
    expect(tokenize(String.raw`say \"hi\" a\ b 'c\d'`)).toEqual(["say", `"hi"`, "a b", "c\\d"]);
  });

  it("keeps an empty quoted word", () => {
    expect(tokenize(`set name ""`)).toEqual(["set", "name", ""]);
  });

  it("refuses an unclosed quote", () => {
    expect(() => tokenize(`run "fade`)).toThrow("Unclosed \" quote");
  });

  it("gives nothing for a blank line", () => {
    expect(tokenize("   ")).toEqual([]);
  });
});

describe("parseArgs", () => {
  it("sorts words into positional, named and flags", () => {
    expect(parseArgs(["fade", "amount=0.5", "--js", "x"])).toEqual({
      positional: ["fade", "x"],
      named: { amount: "0.5" },
      flags: ["js"],
    });
  });

  it("splits a named argument at its first =", () => {
    expect(parseArgs(["url=https://a.b/?q=1"]).named).toEqual({ url: "https://a.b/?q=1" });
  });

  it("takes a word starting with = or a non-identifier key as positional", () => {
    expect(parseArgs(["=x", "a-b=1", "1=2"]).positional).toEqual(["=x", "a-b=1", "1=2"]);
  });

  it("takes a lone -- or a negative number as positional", () => {
    expect(parseArgs(["--", "-0.5"]).positional).toEqual(["--", "-0.5"]);
  });
});
