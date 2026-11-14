// The console: lines in, output out, one job at a time, history, completion,
// a masked prompt for keys and Ctrl+C to stop a job.

import { describe, expect, it } from "vitest";
import { Terminal, type CommandTable } from "../src/console/terminal";

function table(): CommandTable {
  return {
    echo: { summary: "print the words", usage: "echo <words…>", run: (ctx, words) => ctx.print(words.join(" ")) },
    wait: {
      summary: "wait until stopped",
      usage: "wait",
      run: (ctx) =>
        new Promise<void>((_, reject) => ctx.signal.addEventListener("abort", () => reject(new DOMException("stopped", "AbortError")))),
    },
    fail: { summary: "throw", usage: "fail", run: () => { throw new Error("it broke"); } },
    secret: {
      summary: "ask for a key",
      usage: "secret",
      run: async (ctx) => {
        const value = await ctx.askSecret("Key:");
        ctx.print(value === null ? "cancelled" : `got ${value.length} characters`);
      },
    },
    fx: { summary: "effects", usage: "fx <list|new>", subcommands: ["list", "new", "edit"], run: (ctx, words) => ctx.print(`fx ${words.join(" ")}`) },
  };
}

const texts = (t: Terminal) => t.getSnapshot().lines.map((l) => `${l.kind}:${l.text}`);

describe("Terminal", () => {
  it("echoes the line and prints the command's output", async () => {
    const t = new Terminal(table());
    await t.submit("echo hello  world");
    expect(texts(t)).toEqual(["input:echo hello  world", "output:hello world"]);
  });

  it("splits words as a shell does before the command sees them", async () => {
    const t = new Terminal(table());
    await t.submit(`echo "a  b" c`);
    expect(texts(t)[1]).toBe("output:a  b c");
  });

  it("reports an unknown command and a quoting error as error lines", async () => {
    const t = new Terminal(table());
    await t.submit("nope");
    await t.submit(`echo "x`);
    expect(texts(t)).toEqual([
      "input:nope",
      "error:Unknown command \"nope\". Type help for the list.",
      `input:echo "x`,
      "error:Unclosed \" quote",
    ]);
  });

  it("prints a command's thrown error instead of throwing", async () => {
    const t = new Terminal(table());
    await t.submit("fail");
    expect(texts(t)[1]).toBe("error:it broke");
  });

  it("lists the commands for help, and one command's usage for help <command>", async () => {
    const t = new Terminal(table());
    await t.submit("help");
    expect(texts(t)).toContain("output:  echo    print the words");
    await t.submit("help fx");
    expect(texts(t).slice(-2)).toEqual(["output:fx <list|new>", "output:effects"]);
  });

  it("refuses a line while a job runs, and Ctrl+C (cancel) stops the job", async () => {
    const t = new Terminal(table());
    const job = t.submit("wait");
    expect(t.getSnapshot().busy).toBe(true);
    await t.submit("echo hi");
    expect(texts(t)).toContain("error:Wait for the running command, or press Ctrl+C to stop it.");
    t.cancel();
    await job;
    expect(t.getSnapshot().busy).toBe(false);
    expect(texts(t).at(-1)).toBe("info:Stopped.");
  });

  it("keeps the history without repeats or blank lines, and walks it", async () => {
    const saved: string[][] = [];
    const t = new Terminal(table(), { history: ["echo old"], saveHistory: (h) => saved.push([...h]) });
    await t.submit("echo a");
    await t.submit("echo a");
    await t.submit("  ");
    expect(saved.at(-1)).toEqual(["echo old", "echo a"]);
    expect(t.historyStep(-1, "draft")).toBe("echo a");
    expect(t.historyStep(-1, "echo a")).toBe("echo old");
    expect(t.historyStep(-1, "echo old")).toBe("echo old");
    expect(t.historyStep(1, "echo old")).toBe("echo a");
    expect(t.historyStep(1, "echo a")).toBe("draft");
  });

  it("caps the history at 200", async () => {
    const t = new Terminal(table(), { history: Array.from({ length: 200 }, (_, i) => `echo ${i}`) });
    await t.submit("echo new");
    expect(t.getSnapshot().history).toHaveLength(200);
    expect(t.getSnapshot().history[0]).toBe("echo 1");
  });

  it("masks a secret: it never reaches the scrollback or the history", async () => {
    const t = new Terminal(table());
    const job = t.submit("secret");
    await Promise.resolve();
    expect(t.getSnapshot().prompt).toEqual({ label: "Key:", secret: true });
    await t.submit("sk-123456");
    await job;
    expect(texts(t)).toEqual(["input:secret", "info:Key: ••••••", "output:got 9 characters"]);
    expect(t.getSnapshot().history).toEqual(["secret"]);
    expect(t.getSnapshot().prompt).toBeNull();
  });

  it("answers null to a secret prompt cancelled with Ctrl+C", async () => {
    const t = new Terminal(table());
    const job = t.submit("secret");
    await Promise.resolve();
    t.cancel();
    await job;
    expect(texts(t).at(-1)).toBe("output:cancelled");
  });

  it("clears, and caps the scrollback", async () => {
    const t = new Terminal(table(), { maxLines: 3 });
    await t.submit("echo 1");
    await t.submit("echo 2");
    expect(texts(t)).toEqual(["output:1", "input:echo 2", "output:2"]);
    t.clear();
    expect(texts(t)).toEqual([]);
  });

  it("tells subscribers about each change", async () => {
    const t = new Terminal(table());
    let calls = 0;
    const off = t.subscribe(() => calls++);
    await t.submit("echo x");
    off();
    await t.submit("echo y");
    expect(calls).toBeGreaterThan(0);
    const before = calls;
    await t.submit("echo z");
    expect(calls).toBe(before);
  });

  it("updates a progress line in place", async () => {
    const t = new Terminal({
      p: {
        summary: "",
        usage: "p",
        run: (ctx) => {
          const line = ctx.progress("Working 0%");
          line.update("Working 50%");
          line.done("Worked");
        },
      },
    });
    await t.submit("p");
    expect(texts(t)).toEqual(["input:p", "info:Worked"]);
  });
});
