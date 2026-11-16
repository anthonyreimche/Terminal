// Other extensions' commands (api.commands) as console commands: G'MIC's
// `gmic`, say. The console's own commands keep their names.

import type { CommandContext, CommandTable } from "./console/terminal";
import type { CatalogPhoto, CommandsAPI } from "./safelight";

export type ExtensionCommands = Pick<CommandsAPI, "list" | "run">;

/** Runs another extension's command on `photos`, its output in the console. */
export async function runExtensionCommand(
  commands: ExtensionCommands,
  name: string,
  words: string[],
  photos: CatalogPhoto[],
  ctx: CommandContext,
): Promise<void> {
  await commands.run(name, {
    words,
    photos,
    signal: ctx.signal,
    print: ctx.print,
    info: ctx.info,
    warn: ctx.error,
    progress: ctx.progress,
  });
}

export function extensionCommands(commands: ExtensionCommands, targets: () => CatalogPhoto[], reserved: readonly string[]): CommandTable {
  const table: Record<string, CommandTable[string]> = {};
  for (const c of commands.list()) {
    if (reserved.includes(c.name) || Object.hasOwn(table, c.name)) continue;
    table[c.name] = {
      summary: c.summary,
      usage: c.usage.join("\n"),
      subcommands: c.subcommands.map((s) => s.name),
      run: (ctx, words) => runExtensionCommand(commands, c.name, words, targets(), ctx),
    };
  }
  return table;
}
