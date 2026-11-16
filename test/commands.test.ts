// The commands, run through the console against stand-in services.

import { describe, expect, it, vi } from "vitest";
import { createCommands, type EditTarget, type Services } from "../src/commands";
import { Terminal } from "../src/console/terminal";
import { defaultEndpoint, type Endpoint } from "../src/endpoints/endpoint";
import { ENGINES } from "../src/effects/engines";
import type { EffectRecord } from "../src/library";
import type { CatalogPhoto } from "../src/safelight";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
const photo = (id: string, filename = `${id}.NEF`) => ({ id, filename, folder: "" }) as CatalogPhoto;

function rig(opts: { effects?: EffectRecord[]; endpoints?: Endpoint[]; targets?: CatalogPhoto[]; open?: CatalogPhoto | null; allowed?: boolean; gmic?: boolean } = {}) {
  let effects = opts.effects ?? [];
  let endpoints = opts.endpoints ?? [];
  const bag: Record<string, unknown> = { exposure: 0, "x.stage.k": false };
  const edits: EditTarget[] = [];
  const commits: string[] = [];
  const imports: { photo: string; slug: string; ext: string; type: string }[] = [];
  const fetches: { url: string; init: Parameters<Services["network"]["fetch"]>[1] }[] = [];
  const keys = new Map<string, string>();
  let allowed = opts.allowed ?? true;
  const services: Services = {
    effects: () => effects,
    saveEffects: (e) => void (effects = e),
    endpoints: () => endpoints,
    saveEndpoints: (e) => void (endpoints = e),
    isLive: (slug) => effects.some((e) => e.slug === slug && e.kind === "glsl" && !e.source.includes("broken")),
    edit: (t) => void edits.push(t),
    targets: () => opts.targets ?? [photo("a")],
    openPhoto: () => (opts.open === undefined ? photo("a") : opts.open),
    displayName: (p) => p.filename,
    develop: {
      keys: () => [
        { key: "exposure", label: "Exposure", kind: "number" },
        { key: "x.stage.k", label: "K", kind: "boolean" },
      ],
      get: (k) => bag[k],
      set: (k, v) => ((bag[k] = v), true),
      commit: async (label) => void commits.push(label),
    },
    showEffectsPanel: vi.fn(),
    renderForScript: async () => ({ width: 1, height: 1, data: new Float32Array([0.5, 0.5, 0.5, 1]) }),
    runScript: vi.fn(async (_src, o) => {
      o.onProgress?.(0.5);
      if (Number(o.params.levels) === 13) throw new Error("unlucky");
      return o.image;
    }),
    timeLimitMs: () => 1000,
    encodePng: async () => new Blob([PNG], { type: "image/png" }),
    renderForSend: async () => ({ bytes: new Uint8Array([1]), type: "image/jpeg" }),
    importBeside: async (p, data, slug, ext) => {
      imports.push({ photo: p.id, slug, ext, type: data.type });
      return { ok: true, name: `${p.id}-${slug}.${ext}` };
    },
    network: {
      hasAccess: async () => allowed,
      requestAccess: vi.fn(async () => (allowed = opts.allowed !== false ? true : false)),
      fetch: vi.fn(async (url: string, init) => {
        fetches.push({ url, init });
        if (url.endsWith("/json")) return new Response(JSON.stringify({ out: "https://cdn.example.com/r.png" }), { status: 200 });
        return new Response(PNG, { status: 200, headers: { "Content-Type": "image/png" } });
      }),
    },
    commands: {
      has: (name) => name === "gmic" && opts.gmic === true,
      run: vi.fn(async () => {}),
    },
    keys: {
      get: async (slug) => keys.get(slug) ?? null,
      set: async (slug, v) => (keys.set(slug, v), true),
      delete: async (slug) => void keys.delete(slug),
    },
  };
  const t = new Terminal(createCommands(services));
  const out = () => t.getSnapshot().lines.filter((l) => l.kind !== "input").map((l) => `${l.kind}:${l.text}`);
  return { t, services, out, edits, commits, imports, fetches, keys, bag, effects: () => effects, endpoints: () => endpoints };
}

const glsl = (name: string, source = ENGINES.glsl.template): EffectRecord => ({ name, slug: name.toLowerCase(), kind: "glsl", source });
const js = (name: string, source = ENGINES.js.template): EffectRecord => ({ name, slug: name.toLowerCase(), kind: "js", source });

describe("fx", () => {
  it("opens a new GLSL effect from the template in the editor", async () => {
    const r = rig();
    await r.t.submit("fx new Warm");
    expect(r.edits).toEqual([{ kind: "effect", isNew: true, record: { name: "Warm", slug: "warm", kind: "glsl", source: ENGINES.glsl.template } }]);
  });

  it("opens a JS one with --js, and refuses G'MIC without the G'MIC extension", async () => {
    const r = rig();
    await r.t.submit("fx new Post --js");
    expect(r.edits[0]).toMatchObject({ record: { kind: "js", source: ENGINES.js.template } });
    await r.t.submit("fx new G --gmic");
    expect(r.out().at(-1)).toBe(`error:${ENGINES.gmic.unavailable}`);
  });

  it("refuses a name in use", async () => {
    const r = rig({ effects: [glsl("Warm")] });
    await r.t.submit("fx new WARM");
    expect(r.out()).toEqual(['error:There is already an effect named "WARM". Use fx edit.']);
  });

  it("lists the effects with their kind, state and params", async () => {
    const r = rig({ effects: [glsl("Warm"), glsl("Bad", "broken"), js("Post")] });
    await r.t.submit("fx list");
    expect(r.out()).toEqual(["output:warm  GLSL  live  warmth", "output:bad  GLSL  has errors", "output:post  JavaScript  run  levels"]);
  });

  it("applies a live effect's Amount on the open photo as one undo step and shows the sliders", async () => {
    const r = rig({ effects: [glsl("Warm")] });
    await r.t.submit("fx apply warm 0.4");
    expect(r.bag["terminal.fx.warm.fx_amount"]).toBe(0.4);
    expect(r.commits).toEqual(["Terminal: Warm"]);
    expect(r.services.showEffectsPanel).toHaveBeenCalled();
    await r.t.submit("fx off warm");
    expect(r.bag["terminal.fx.warm.fx_amount"]).toBe(0);
  });

  it("refuses to apply a script effect, a broken one, or with no open photo", async () => {
    const r = rig({ effects: [js("Post"), glsl("Bad", "broken")] });
    await r.t.submit("fx apply post");
    await r.t.submit("fx apply bad");
    const none = rig({ effects: [glsl("Warm")], open: null });
    await none.t.submit("fx apply warm");
    expect(r.out()).toEqual([
      "error:Post isn't a live effect: run it with run post",
      "error:Bad has errors and isn't running. Fix it with fx edit bad.",
    ]);
    expect(none.out()).toEqual(["error:Open a photo in Develop first."]);
  });

  it("removes an effect", async () => {
    const r = rig({ effects: [glsl("Warm"), js("Post")] });
    await r.t.submit("fx rm warm");
    expect(r.effects().map((e) => e.slug)).toEqual(["post"]);
  });
});

describe("set and get", () => {
  it("sets several values as one undo step and prints them back", async () => {
    const r = rig();
    await r.t.submit("set exposure 0.5 x.stage.k on");
    expect(r.bag).toMatchObject({ exposure: 0.5, "x.stage.k": true });
    expect(r.commits).toEqual(["Terminal"]);
    expect(r.out()).toEqual(["output:exposure = 0.5", "output:x.stage.k = true"]);
  });

  it("refuses an unknown key or a bad value before changing anything", async () => {
    const r = rig();
    await r.t.submit("set exposure 1 nope 2");
    await r.t.submit("set exposure lots");
    expect(r.bag.exposure).toBe(0);
    expect(r.commits).toEqual([]);
    expect(r.out()).toEqual(['error:Unknown value "nope". Type params to list them.', 'error:Give a number, not "lots"']);
  });

  it("reads a value", async () => {
    const r = rig();
    await r.t.submit("get exposure");
    expect(r.out()).toEqual(["output:0"]);
  });
});

describe("run", () => {
  it("renders, runs and imports each photo, reporting each", async () => {
    const r = rig({ effects: [js("Post")], targets: [photo("a"), photo("b")] });
    await r.t.submit("run post levels=6");
    expect(r.services.runScript).toHaveBeenCalledTimes(2);
    expect(vi.mocked(r.services.runScript).mock.calls[0][1]).toMatchObject({ params: { levels: 6 }, timeoutMs: 1000 });
    expect(r.imports).toEqual([
      { photo: "a", slug: "post", ext: "png", type: "image/png" },
      { photo: "b", slug: "post", ext: "png", type: "image/png" },
    ]);
    expect(r.out()).toEqual(["info:a.NEF → a-post.png", "info:b.NEF → b-post.png", "info:2 of 2 done."]);
  });

  it("refuses bad params and live effects before rendering anything", async () => {
    const r = rig({ effects: [js("Post"), glsl("Warm")] });
    await r.t.submit("run post levels=x size=2");
    await r.t.submit("run warm");
    expect(r.services.runScript).not.toHaveBeenCalled();
    expect(r.out()).toEqual(['error:unknown param "size"; levels must be a number', "error:Warm is a live effect: use fx apply warm"]);
  });

  it("goes on past a photo that fails", async () => {
    const r = rig({ effects: [js("Post")], targets: [photo("a"), photo("b")] });
    vi.mocked(r.services.runScript).mockRejectedValueOnce(new Error("line 3: boom"));
    await r.t.submit("run post");
    expect(r.out()).toEqual(["info:a.NEF: failed", "error:a.NEF: line 3: boom", "info:b.NEF → b-post.png", "info:1 of 2 done."]);
  });

  it("says so when there are no photos", async () => {
    const r = rig({ effects: [js("Post")], targets: [] });
    await r.t.submit("run post");
    expect(r.out()).toEqual(["error:No photo to work on: select photos in the Library or open one in Develop."]);
  });
});

describe("api", () => {
  const ep = (patch: Partial<Endpoint> = {}) => ({ ...defaultEndpoint("Up", "https://api.example.com/{{model}}"), ...patch });

  it("asks for a key masked and keeps it", async () => {
    const r = rig({ endpoints: [ep()] });
    const job = r.t.submit("api key up");
    await Promise.resolve();
    await Promise.resolve();
    await r.t.submit(" sk-1 ");
    await job;
    expect(r.keys.get("up")).toBe("sk-1");
    expect(r.out()).toEqual(["info:Key for Up: ••••••", "output:Key kept for Up."]);
  });

  it("sends each photo with the key and imports the answer", async () => {
    const r = rig({ endpoints: [ep()] });
    r.keys.set("up", "k");
    await r.t.submit("api send up model=x4");
    expect(r.fetches[0].url).toBe("https://api.example.com/x4");
    expect(r.fetches[0].init).toMatchObject({ method: "POST", timeoutMs: 300000, headers: { Authorization: "Bearer k" } });
    expect(r.fetches[0].init?.signal).toBeInstanceOf(AbortSignal);
    expect(r.imports).toEqual([{ photo: "a", slug: "up", ext: "png", type: "image/png" }]);
    expect(r.out()).toEqual(["info:a.NEF → a-up.png"]);
  });

  it("asks once for access to an address not yet allowed, and stops before rendering when refused", async () => {
    const r = rig({ endpoints: [ep({ auth: null })], allowed: false, targets: [photo("a"), photo("b")] });
    const render = vi.spyOn(r.services, "renderForSend");
    await r.t.submit("api send up model=x");
    expect(r.services.network.requestAccess).toHaveBeenCalledTimes(1);
    expect(r.services.network.requestAccess).toHaveBeenCalledWith("https://api.example.com/x");
    expect(render).not.toHaveBeenCalled();
    expect(r.out()).toEqual(["error:Safelight isn't allowed to reach https://api.example.com."]);
  });

  it("asks for access once for several photos", async () => {
    const r = rig({ endpoints: [ep({ auth: null })], allowed: false, targets: [photo("a"), photo("b")] });
    vi.mocked(r.services.network.requestAccess).mockResolvedValue(true);
    let asked = 0;
    r.services.network.hasAccess = async () => asked++ > 0;
    await r.t.submit("api send up model=x");
    expect(r.services.network.requestAccess).toHaveBeenCalledTimes(1);
    expect(r.imports).toHaveLength(2);
  });

  it("downloads an image the JSON answer points to", async () => {
    const r = rig({ endpoints: [ep({ url: "https://api.example.com/json", auth: null, reply: "json", path: "out" })] });
    await r.t.submit("api send up");
    expect(r.fetches.map((f) => f.url)).toEqual(["https://api.example.com/json", "https://cdn.example.com/r.png"]);
    expect(r.imports[0]).toMatchObject({ ext: "png" });
  });

  it("refuses without a key or a placeholder's value before rendering anything", async () => {
    const r = rig({ endpoints: [ep()], targets: [photo("a"), photo("b")] });
    const render = vi.spyOn(r.services, "renderForSend");
    await r.t.submit("api send up model=x");
    r.keys.set("up", "k");
    await r.t.submit("api send up");
    expect(render).not.toHaveBeenCalled();
    expect(r.out()).toEqual(["error:No key for Up. Set one with: api key up", "error:Give a value for model (e.g. model=…)"]);
  });

  it("removes an endpoint and its key", async () => {
    const r = rig({ endpoints: [ep()] });
    r.keys.set("up", "k");
    await r.t.submit("api rm up");
    expect(r.endpoints()).toEqual([]);
    expect(r.keys.has("up")).toBe(false);
  });

  it("opens a new endpoint in the editor with the address given", async () => {
    const r = rig();
    await r.t.submit("api new Upscale https://u.example.com");
    expect(r.edits[0]).toMatchObject({ kind: "endpoint", isNew: true, record: { name: "Upscale", url: "https://u.example.com" } });
  });
});

describe("G'MIC effects", () => {
  const gmic = (name: string, source = ENGINES.gmic.template): EffectRecord => ({ name, slug: name.toLowerCase(), kind: "gmic", source });

  it("refuses a G'MIC effect while no extension runs the gmic command", async () => {
    const r = rig();
    await r.t.submit("fx new Soft --gmic");
    expect(r.out()).toEqual([`error:${ENGINES.gmic.unavailable}`]);
    expect(r.edits).toEqual([]);
  });

  it("starts a G'MIC effect from its template once the gmic command is there", async () => {
    const r = rig({ gmic: true });
    await r.t.submit("fx new Soft --gmic");
    expect(r.edits[0]).toMatchObject({ kind: "effect", isNew: true, record: { kind: "gmic", source: ENGINES.gmic.template } });
  });

  it("runs a G'MIC effect through the gmic command, its settings as Name=value words", async () => {
    const r = rig({ gmic: true, effects: [gmic("Soft")] });
    await r.t.submit("run soft strength=0.4");
    const run = r.services.commands.run as ReturnType<typeof vi.fn>;
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][0]).toBe("gmic");
    expect(run.mock.calls[0][1]).toEqual(["script", "--source", ENGINES.gmic.template, "strength=0.4"]);
  });

  it("refuses to run a G'MIC effect without the gmic command", async () => {
    const r = rig({ effects: [gmic("Soft")] });
    await r.t.submit("run soft");
    expect(r.out()).toEqual([`error:${ENGINES.gmic.unavailable}`]);
  });
});

