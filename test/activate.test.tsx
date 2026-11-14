// What activate() registers, the Ctrl+` shortcut, the live effects kept in
// step with the settings, and the panels as a person uses them.

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import manifest from "../safelight.json";
import { ENGINES } from "../src/effects/engines";
import { EXTENSION_ID } from "../src/ids";
import { EFFECTS_PANEL_ID, PANEL_ID, TERMINAL_PLACEMENT, TOGGLE_ACTION, activate, deactivate } from "../src/index";
import { React } from "../src/rt";
import { fakeApi } from "./support/fake-api";

afterEach(() => {
  cleanup();
  deactivate();
});

const WARM = { name: "Warm", kind: "glsl", source: ENGINES.glsl.template };
const noCompiler = () => null;

async function enter(input: HTMLElement, text: string) {
  fireEvent.change(input, { target: { value: text } });
  await act(async () => {
    fireEvent.keyDown(input, { key: "Enter" });
  });
}

async function click(el: HTMLElement) {
  await act(async () => {
    fireEvent.click(el);
  });
}

function start(settings: Record<string, unknown> = {}) {
  const rig = fakeApi(settings);
  const done = activate(rig.api, noCompiler);
  const panel = (id: string) => {
    const c = rig.panels.find((p) => p.id === id);
    if (!c) throw new Error(`no panel ${id}`);
    return React.createElement(c.component);
  };
  return { rig, ...done, panel };
}

describe("activate", () => {
  it("names everything under the manifest's id", () => {
    expect(EXTENSION_ID).toBe(manifest.id);
  });

  it("registers the Terminal as a fill panel that may dock at the bottom, seeded in no layout", () => {
    const { rig } = start();
    const terminal = rig.panels.find((p) => p.id === PANEL_ID)!;
    expect(terminal).toMatchObject({ title: "Terminal", allowBottomDock: true, fill: true });
    expect(terminal.defaultDock).toBeUndefined();
    expect(rig.panels.find((p) => p.id === EFFECTS_PANEL_ID)?.defaultDock).toBeUndefined();
  });

  it("binds Ctrl+` to open the Terminal under the main view and close it again", () => {
    const { rig, focus } = start();
    const [binding] = rig.keybindings;
    expect(binding).toMatchObject({ id: TOGGLE_ACTION, label: "Toggle Terminal", category: "General", defaultCombo: "Ctrl+`" });
    binding.handler();
    expect(rig.toggles).toEqual([[PANEL_ID, { direction: "bottom", height: 240 }]]);
    expect(TERMINAL_PLACEMENT).toEqual({ direction: "bottom", height: 240 });
    expect(focus.get()).toBe(1);
    binding.handler();
    expect(rig.open.has(PANEL_ID)).toBe(false);
    expect(focus.get()).toBe(1);
  });

  it("registers a stage for each saved GLSL effect, and declares the settings", () => {
    const { rig } = start({ effects: [WARM, { name: "Post", kind: "js", source: ENGINES.js.template }] });
    expect([...rig.stages.keys()]).toEqual(["terminal.fx.warm"]);
    expect(rig.settingsContributions[0].fields.map((f) => f.key)).toEqual(["scriptSize", "timeLimit"]);
  });

  it("follows effects saved in another window, registering only what changed", () => {
    const { rig } = start({ effects: [WARM] });
    rig.setSetting("effects", [WARM, { name: "Cool", kind: "glsl", source: "c.b += 0.1;" }]);
    expect(rig.registrations).toEqual(["terminal.fx.warm", "terminal.fx.cool"]);
    rig.setSetting("effects", [{ name: "Cool", kind: "glsl", source: "c.b += 0.1;" }]);
    expect([...rig.stages.keys()]).toEqual(["terminal.fx.cool"]);
  });

  it("reports a saved effect that can't run in the Terminal, once", () => {
    const bad = { name: "Bad", kind: "glsl", source: "return;" };
    const { terminal, rig } = start({ effects: [bad] });
    rig.setSetting("effects", [bad, WARM]);
    rig.setSetting("effects", [bad, WARM]);
    expect(terminal.getSnapshot().lines.map((l) => l.text)).toEqual(["Bad: line 1: return would end the whole program; set c instead"]);
  });
});

describe("the Terminal panel", () => {
  it("runs a typed line, walks the history and completes with Tab", async () => {
    const { panel } = start();
    render(panel(PANEL_ID));
    const input = screen.getByLabelText("Command") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "fx li" } });
    fireEvent.keyDown(input, { key: "Tab" });
    expect(input.value).toBe("fx list ");
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    expect(await screen.findByText("No effects yet. Make one with: fx new <name> [--glsl|--js]")).toBeTruthy();
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input.value).toBe("fx list ");
    fireEvent.keyDown(input, { key: "l", ctrlKey: true });
    expect(screen.queryByText(/No effects yet/)).toBeNull();
  });

  it("takes focus when the shortcut opens it", () => {
    const { panel, rig } = start();
    render(panel(PANEL_ID));
    const input = screen.getByLabelText("Command");
    input.blur();
    act(() => rig.keybindings[0].handler());
    expect(document.activeElement).toBe(input);
  });

  it("opens the editor for fx new, refuses a broken save and keeps a good one", async () => {
    const { panel, rig } = start();
    render(panel(PANEL_ID));
    await enter(screen.getByLabelText("Command"), "fx new Glow");
    const source = (await screen.findByLabelText("Glow source")) as HTMLTextAreaElement;
    expect(source.value).toBe(ENGINES.glsl.template);
    fireEvent.change(source, { target: { value: "// @param mix float 1\nc *= mix;" } });
    await click(screen.getByText("Save"));
    expect(screen.getByRole("status").textContent).toBe('line 1: "mix" is a GLSL name; pick another');
    expect(rig.settings.get("effects")).toBeUndefined();
    fireEvent.change(source, { target: { value: "// @param gain float 0 2 1\nc *= gain;" } });
    await click(screen.getByText("Save"));
    expect(rig.settings.get("effects")).toEqual([{ name: "Glow", kind: "glsl", source: "// @param gain float 0 2 1\nc *= gain;" }]);
    expect(rig.stages.has("terminal.fx.glow")).toBe(true);
    expect(await screen.findByText("Saved Glow. Turn it on with: fx apply glow")).toBeTruthy();
  });

  it("masks a key as it is typed", async () => {
    const { panel } = start({ endpoints: [{ name: "Up", url: "https://api.example.com" }] });
    render(panel(PANEL_ID));
    await enter(screen.getByLabelText("Command"), "api key up");
    const prompt = (await screen.findByLabelText("Key for Up:")) as HTMLInputElement;
    expect(prompt.type).toBe("password");
  });

  it("asks for the address when an endpoint is saved", async () => {
    const { panel, rig } = start();
    render(panel(PANEL_ID));
    await enter(screen.getByLabelText("Command"), "api new Up https://api.example.com/v1");
    await click(await screen.findByText("Save"));
    expect(rig.access).toEqual(["https://api.example.com/v1"]);
    expect(rig.settings.get("endpoints")).toMatchObject([{ name: "Up", url: "https://api.example.com/v1", send: "multipart" }]);
  });
});

describe("suggestions", () => {
  const options = () => screen.queryAllByRole("option").map((o) => o.textContent);

  function type(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
    input.focus();
    fireEvent.input(input, { target: { value, selectionStart: value.length, selectionEnd: value.length } });
  }

  it("lists what can come next as the prompt is typed, and Tab takes the highlighted one", () => {
    const { panel } = start({ effects: [WARM] });
    render(panel(PANEL_ID));
    const input = screen.getByLabelText("Command") as HTMLInputElement;
    type(input, "fx ");
    expect(options()).toEqual(["list", "new", "edit", "rm", "apply", "off"]);
    expect(input.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[4].getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(input, { key: "Tab" });
    expect(input.value).toBe("fx apply ");
    expect(options()).toEqual(["warm"]);
  });

  it("shows what the highlighted suggestion is", () => {
    const { panel } = start();
    render(panel(PANEL_ID));
    type(screen.getByLabelText("Command") as HTMLInputElement, "fx ");
    expect(screen.getByRole("listbox").textContent).toContain("your effects");
  });

  it("takes a suggestion that is clicked, and closes with Escape", () => {
    const { panel } = start();
    render(panel(PANEL_ID));
    const input = screen.getByLabelText("Command") as HTMLInputElement;
    type(input, "api ");
    fireEvent.click(screen.getByText("new"));
    expect(input.value).toBe("api new ");
    type(input, "fx ");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("walks the history with the arrows while no list is showing", async () => {
    const { panel } = start();
    render(panel(PANEL_ID));
    const input = screen.getByLabelText("Command") as HTMLInputElement;
    await enter(input, "photos");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input.value).toBe("photos");
  });

  it("suggests the language, helpers and params in the effect editor", async () => {
    const { panel } = start();
    render(panel(PANEL_ID));
    await enter(screen.getByLabelText("Command"), "fx new Glow");
    const source = (await screen.findByLabelText("Glow source")) as HTMLTextAreaElement;
    type(source, "// @param gain float 0 2 1\nc = mi");
    expect(options()).toEqual(["min", "mix"]);
    fireEvent.keyDown(source, { key: "ArrowDown" });
    fireEvent.keyDown(source, { key: "Tab" });
    expect(source.value).toBe("// @param gain float 0 2 1\nc = mix");
    type(source, "// @param gain float 0 2 1\nc = mix(c, c * g");
    expect(options()).toEqual(["gain"]);
    expect(screen.getByRole("listbox").textContent).toContain("float param, 0 to 2");
  });

  it("opens the editor's list with Ctrl+Space and closes it with Escape", async () => {
    const { panel } = start();
    render(panel(PANEL_ID));
    await enter(screen.getByLabelText("Command"), "fx new Glow");
    const source = (await screen.findByLabelText("Glow source")) as HTMLTextAreaElement;
    type(source, "// @");
    fireEvent.keyDown(source, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.keyDown(source, { key: " ", ctrlKey: true });
    expect(options()).toEqual(["@param", "@phase"]);
  });
});

describe("the Script Effects panel", () => {
  it("says how to make an effect while there are none", () => {
    const { panel } = start();
    render(panel(EFFECTS_PANEL_ID));
    expect(screen.getByText(/No live effects yet/)).toBeTruthy();
  });

  it("shows Amount and each param, writing the photo's values with one undo step per release", () => {
    const { panel, rig } = start({ effects: [WARM] });
    render(panel(EFFECTS_PANEL_ID));
    expect(screen.getByText("Warm")).toBeTruthy();
    const amount = rig.sliders.filter((s) => s.label === "Amount").at(-1)!;
    act(() => amount.onChange(0.6));
    act(() => amount.onCommit?.());
    expect(rig.bag["terminal.fx.warm.fx_amount"]).toBe(0.6);
    expect(rig.commits).toEqual(["Terminal: Warm"]);
    expect(rig.sliders.some((s) => s.label === "Warmth" && s.min === -1 && s.max === 1)).toBe(true);
  });
});
