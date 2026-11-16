// The entry point: the Terminal panel and its Ctrl+` shortcut, the Script
// Effects panel, the live GLSL effects as stages, and the settings.

import { createCommands, type EditTarget } from "./commands";
import { Observable } from "./console/observable";
import { suggestLine } from "./console/suggest";
import { Terminal } from "./console/terminal";
import { webglCompiler, type Compile } from "./effects/glsl";
import { LiveEffects } from "./effects/live";
import { makeEffectsPanel } from "./EffectsPanel";
import { extensionCommands } from "./extension-commands";
import type { Endpoint } from "./endpoints/endpoint";
import { EFFECTS_PANEL_ID, PANEL_ID, TOGGLE_ACTION, TOGGLE_COMBO } from "./ids";
import { EFFECTS_KEY, readEffects, readEndpoints, writeEffects, writeEndpoints, type EffectRecord } from "./library";
import { initRuntime } from "./rt";
import type { SafelightAPI } from "./safelight";
import { createServices } from "./services";
import { HISTORY, settingsContribution } from "./settings";
import { makeTerminalPanel } from "./TerminalPanel";

export { EFFECTS_PANEL_ID, PANEL_ID, TOGGLE_ACTION };

export const TERMINAL_PLACEMENT = { direction: "bottom", height: 240 } as const;

export interface Activated {
  terminal: Terminal;
  editing: Observable<EditTarget | null>;
  effects: Observable<EffectRecord[]>;
  live: LiveEffects;
  focus: Observable<number>;
}

let stopListening: (() => void) | null = null;

export function activate(api: SafelightAPI, compiler: () => Compile | null = lazyCompiler()): Activated {
  initRuntime(api);
  const editing = new Observable<EditTarget | null>(null);
  const focus = new Observable(0);
  const effects = new Observable<EffectRecord[]>([]);
  const live = new LiveEffects({
    register: (stage) => api.registerProcessingStage(stage),
    unregister: (id) => api.unregisterProcessingStage(id),
  });

  const problems: string[] = [];
  let report: (line: string) => void = (line) => void problems.push(line);
  // A sync runs on every save (and again as the setting's change comes
  // back), so only problems that weren't there last time are reported.
  let known = new Set<string>();
  const sync = () => {
    const list = readEffects(api.settings);
    const found = live.sync(list);
    for (const p of found) if (!known.has(p)) report(p);
    known = new Set(found);
    effects.set(list);
  };

  const services = createServices(api, live, (target) => editing.set(target), sync);
  const history = api.settings.get<unknown>(HISTORY, []);
  const builtins = createCommands(services);
  const reserved = [...Object.keys(builtins), "help", "clear"];
  // Built here at each line, so another extension's command (G'MIC's gmic)
  // is there as soon as it registers, and gone once it is turned off.
  const commands = () => ({ ...extensionCommands(api.commands, services.targets, reserved), ...builtins });
  const terminal = new Terminal(commands, {
    history: Array.isArray(history) ? history.filter((h): h is string => typeof h === "string") : [],
    saveHistory: (h) => api.settings.set(HISTORY, h),
  });
  report = (line) => terminal.write("error", line);
  sync();
  for (const p of problems) report(p);

  stopListening?.();
  stopListening = api.settings.onChange((key) => {
    if (key === EFFECTS_KEY) sync();
  });

  const saveEffect = (record: EffectRecord, isNew: boolean) => {
    const list = readEffects(api.settings);
    writeEffects(api.settings, isNew ? [...list, record] : list.map((e) => (e.slug === record.slug ? record : e)));
    sync();
    const hint = !isNew ? "" : record.kind === "glsl" ? ` Turn it on with: fx apply ${record.slug}` : ` Run it with: run ${record.slug}`;
    terminal.write("info", `Saved ${record.name}.${hint}`);
  };

  const saveEndpoint = async (record: Endpoint, isNew: boolean) => {
    const origin = new URL(record.url).origin;
    if (!origin.includes("{{") && !(await api.network.requestAccess(record.url))) {
      throw new Error(`Safelight isn't allowed to reach ${origin}; the endpoint wasn't saved.`);
    }
    const list = readEndpoints(api.settings);
    writeEndpoints(api.settings, isNew ? [...list, record] : list.map((e) => (e.slug === record.slug ? record : e)));
    terminal.write("info", `Saved ${record.name}.${record.auth ? ` Set its key with: api key ${record.slug}` : ""}`);
  };

  api.registerPanel({
    id: PANEL_ID,
    title: "Terminal",
    component: makeTerminalPanel({
      terminal,
      editing,
      focus,
      compile: compiler,
      saveEffect,
      saveEndpoint,
      suggest: (text, cursor) =>
        suggestLine(text, cursor, {
          commands,
          effects: services.effects,
          endpoints: services.endpoints,
          developKeys: services.develop.keys,
        }),
    }),
    allowBottomDock: true,
    fill: true,
  });

  api.registerPanel({
    id: EFFECTS_PANEL_ID,
    title: "Script Effects",
    component: makeEffectsPanel(effects, (slug) => live.has(slug)),
  });

  api.registerKeybinding({
    id: TOGGLE_ACTION,
    label: "Toggle Terminal",
    category: "General",
    defaultCombo: TOGGLE_COMBO,
    handler: () => {
      api.dock.togglePanel(PANEL_ID, TERMINAL_PLACEMENT);
      if (api.dock.isPanelOpen(PANEL_ID)) focus.set(focus.get() + 1);
    },
  });

  api.registerSettings(settingsContribution);
  return { terminal, editing, effects, live, focus };
}

export function deactivate(): void {
  stopListening?.();
  stopListening = null;
}

function lazyCompiler(): () => Compile | null {
  let compile: Compile | null | undefined;
  return () => {
    if (compile === undefined) {
      try {
        compile = webglCompiler();
      } catch {
        compile = null;
      }
    }
    return compile;
  };
}
