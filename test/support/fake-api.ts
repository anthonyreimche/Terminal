// A stand-in Safelight API for unit tests, over real React. It has only what
// this extension uses at activation and in its panels: reading any other
// member throws, naming it. Settings live in a map and tell their listeners;
// the UI kit and Slider are plain stand-ins a test can drive.

import * as React from "react";
import type {
  KeyActionContribution,
  PanelContribution,
  ParamScope,
  ProcessingStageContribution,
  SafelightAPI,
  SettingsContribution,
  SliderProps,
} from "../../src/safelight";
import { EXTENSION_ID } from "../../src/ids";

export interface Rig {
  api: SafelightAPI;
  panels: PanelContribution[];
  stages: Map<string, ProcessingStageContribution>;
  registrations: string[];
  keybindings: KeyActionContribution[];
  settingsContributions: SettingsContribution[];
  settings: Map<string, unknown>;
  /** Write a setting as another window would: listeners hear it. */
  setSetting(key: string, value: unknown): void;
  toggles: unknown[][];
  open: Set<string>;
  bag: Record<string, unknown>;
  commits: string[];
  sliders: SliderProps[];
  access: string[];
}

type Props = { children?: React.ReactNode } & Record<string, unknown>;

export function fakeApi(initial: Record<string, unknown> = {}): Rig {
  const settings = new Map<string, unknown>(Object.entries(initial));
  const listeners = new Set<(key: string, value: unknown) => void>();
  const bagListeners = new Set<() => void>();
  const setSetting = (key: string, value: unknown) => {
    settings.set(key, value);
    for (const l of listeners) l(key, value);
  };
  const rig: Omit<Rig, "api"> = {
    panels: [],
    stages: new Map(),
    registrations: [],
    keybindings: [],
    settingsContributions: [],
    settings,
    setSetting,
    toggles: [],
    open: new Set(),
    bag: {},
    commits: [],
    sliders: [],
    access: [],
  };

  function useParamScope(): ParamScope {
    const [, rerender] = React.useState(0);
    React.useEffect(() => {
      const f = () => rerender((n) => n + 1);
      bagListeners.add(f);
      return () => void bagListeners.delete(f);
    }, []);
    return {
      maskId: null,
      getParam: (key) => rig.bag[key],
      getParams: () => rig.bag,
      setParams: (patch) => {
        Object.assign(rig.bag, patch);
        for (const f of bagListeners) f();
      },
      commit: (label) => void rig.commits.push(label),
    };
  }

  const box = ({ children, gap: _g, align: _a, justify: _j, wrap: _w, ...rest }: Props) => React.createElement("div", rest, children);
  const ui = {
    Button: ({ children, onClick, disabled }: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) =>
      React.createElement("button", { type: "button", onClick, disabled }, children),
    TextArea: ({ value, onChange, mono: _mono, ...rest }: { value: string; onChange(v: string): void; mono?: boolean } & Record<string, unknown>) =>
      React.createElement("textarea", { ...rest, value, onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value) }),
    TextInput: ({ value, onChange, ...rest }: { value: string; onChange(v: string): void } & Record<string, unknown>) =>
      React.createElement("input", { ...rest, value, onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value) }),
    NumberInput: ({ value, onChange, width: _w, ...rest }: { value: number; onChange(v: number): void; width?: string } & Record<string, unknown>) =>
      React.createElement("input", { ...rest, type: "number", value, onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(Number(e.target.value)) }),
    Select: ({ value, onChange, options, ariaLabel }: { value: string; onChange(v: string): void; options?: { value: string; label: string }[]; ariaLabel?: string }) =>
      React.createElement(
        "select",
        { value, "aria-label": ariaLabel, onChange: (e: React.ChangeEvent<HTMLSelectElement>) => onChange(e.target.value) },
        (options ?? []).map((o) => React.createElement("option", { key: o.value, value: o.value }, o.label)),
      ),
    Toggle: ({ checked, onChange, label }: { checked: boolean; onChange(v: boolean): void; label?: React.ReactNode }) =>
      React.createElement(
        "label",
        null,
        label,
        React.createElement("input", { type: "checkbox", checked, onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.checked) }),
      ),
    Field: ({ label, children }: { label?: React.ReactNode; children?: React.ReactNode }) => React.createElement("div", null, label, children),
    Section: ({ title, children }: { title: React.ReactNode; children?: React.ReactNode }) =>
      React.createElement("section", null, React.createElement("h3", null, title), children),
    Row: box,
    Stack: box,
    tokens: new Proxy({}, { get: (_, key) => `var(--${String(key)})` }),
  };

  function Slider(props: SliderProps) {
    rig.sliders.push(props);
    return React.createElement("div", { "data-slider": props.label }, `${props.label} ${props.value}`);
  }

  const members = {
    version: 1,
    extensionId: EXTENSION_ID,
    react: React,
    registerPanel: (c: PanelContribution) => void rig.panels.push(c),
    registerProcessingStage: (c: ProcessingStageContribution) => {
      rig.stages.set(c.id, c);
      rig.registrations.push(c.id);
    },
    unregisterProcessingStage: (id: string) => void rig.stages.delete(id),
    registerKeybinding: (c: KeyActionContribution) => void rig.keybindings.push(c),
    registerSettings: (c: SettingsContribution) => void rig.settingsContributions.push(c),
    settings: {
      get: <T,>(key: string, fallback: T): T => (settings.has(key) ? (settings.get(key) as T) : fallback),
      set: (key: string, value: unknown) => setSetting(key, value),
      onChange: (cb: (key: string, value: unknown) => void) => {
        listeners.add(cb);
        return () => void listeners.delete(cb);
      },
    },
    dock: {
      togglePanel: (id: string, at?: unknown) => {
        rig.toggles.push([id, at]);
        if (rig.open.has(id)) rig.open.delete(id);
        else rig.open.add(id);
      },
      isPanelOpen: (id: string) => rig.open.has(id),
    },
    commands: {
      list: () => [],
      run: async () => ({ result: null, saved: [] }),
    },
    network: {
      requestAccess: async (url: string) => (rig.access.push(url), true),
    },
    ui,
    components: { Slider },
    develop: { useParamScope },
  };

  return { ...rig, api: strict(members, "api") as unknown as SafelightAPI };
}

/** Wraps a plain object so reading a member it lacks throws, naming the member. */
function strict<T extends object>(target: T, path: string): T {
  return new Proxy(target, {
    get(obj, key, receiver) {
      if (typeof key === "symbol" || key === "then" || key === "toJSON") return Reflect.get(obj, key, receiver);
      if (!(key in obj)) throw new Error(`The fake API has no ${path}.${key}. Add it to test/support/fake-api.ts.`);
      const value: unknown = Reflect.get(obj, key, receiver);
      const isPlainObject = typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype;
      return isPlainObject && key !== "react" && key !== "tokens" ? strict(value, `${path}.${key}`) : value;
    },
  });
}
