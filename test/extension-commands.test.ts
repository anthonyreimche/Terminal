// Other extensions' commands (api.commands) in the console.

import { describe, expect, it, vi } from "vitest";
import { Terminal } from "../src/console/terminal";
import { extensionCommands, type ExtensionCommands } from "../src/extension-commands";
import type { CatalogPhoto, RegisteredCommand } from "../src/safelight";

const PHOTO = { id: "p1", filename: "IMG_1.CR3", folder: "" } as unknown as CatalogPhoto;
const GMIC: RegisteredCommand = {
  name: "gmic",
  summary: "Run G'MIC",
  usage: ["gmic <words…>", "gmic filters [search]"],
  examples: [],
  subcommands: [{ name: "filters", summary: "List filters" }],
  extensionId: "gmic",
};

function rig(list: RegisteredCommand[] = [GMIC]) {
  const run = vi.fn<ExtensionCommands["run"]>(async (_name, o) => {
    o.print("hi");
    o.info("note");
    o.warn("careful");
    const p = o.progress("step 1");
    p.update("step 2", 0.5);
    p.done();
    return { result: null, saved: [] };
  });
  const commands: ExtensionCommands = { list: () => list, run };
  const t = new Terminal(() => ({ ...extensionCommands(commands, () => [PHOTO], ["fx"]) }));
  const out = () => t.getSnapshot().lines.filter((l) => l.kind !== "input").map((l) => `${l.kind}:${l.text}`);
  return { t, run, out };
}

describe("extensionCommands", () => {
  it("runs an extension's command on the targets with the words untouched", async () => {
    const { t, run } = rig();
    await t.submit('gmic -blur 3 text "a b"');
    expect(run).toHaveBeenCalledTimes(1);
    const [name, options] = run.mock.calls[0];
    expect(name).toBe("gmic");
    expect(options.words).toEqual(["-blur", "3", "text", "a b"]);
    expect(options.photos).toEqual([PHOTO]);
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it("shows its output, notes, warnings and progress in the console", async () => {
    const { t, out } = rig();
    await t.submit("gmic blur 3");
    expect(out()).toEqual(["output:hi", "info:note", "error:careful", "info:step 2"]);
  });

  it("gives it its usage and subcommands for help and suggestions", () => {
    const table = extensionCommands({ list: () => [GMIC], run: vi.fn() }, () => [], []);
    expect(table.gmic.usage).toBe("gmic <words…>\ngmic filters [search]");
    expect(table.gmic.summary).toBe("Run G'MIC");
    expect(table.gmic.subcommands).toEqual(["filters"]);
  });

  it("leaves out a command named like one of the Terminal's own", () => {
    const fx: RegisteredCommand = { ...GMIC, name: "fx" };
    expect(Object.keys(extensionCommands({ list: () => [GMIC, fx], run: vi.fn() }, () => [], ["fx"]))).toEqual(["gmic"]);
  });

  it("shows the command's error", async () => {
    const { t, run, out } = rig();
    run.mockRejectedValueOnce(new Error("G'MIC isn't set up."));
    await t.submit("gmic blur 3");
    expect(out()).toEqual(["error:G'MIC isn't set up."]);
  });
});
