// A JavaScript effect runs in a worker of its own, made from the runtime
// prelude and the effect's source, with the network taken away. The runner
// hands it the image and params and resolves with the image it returns.

import { describe, expect, it, vi } from "vitest";
import { PRELUDE_LINES, runJsEffect, workerSource, type FloatImage } from "../src/effects/js-runner";
import { vmWorker, type VmWorker } from "./support/vm-worker";

function image(width = 2, height = 1, fill = 0.5): FloatImage {
  return { width, height, data: new Float32Array(width * height * 4).fill(fill) };
}

function run(source: string, opts: Partial<Parameters<typeof runJsEffect>[1]> = {}) {
  let worker: VmWorker | null = null;
  const result = runJsEffect(source, {
    image: image(),
    params: {},
    timeoutMs: 2000,
    createWorker: (src) => (worker = vmWorker(src)),
    ...opts,
  });
  return { result, worker: () => worker! };
}

describe("workerSource", () => {
  it("puts the effect's source after the prelude, which is PRELUDE_LINES long", () => {
    const src = workerSource("// mine");
    const lines = src.split("\n");
    expect(lines[PRELUDE_LINES]).toBe("// mine");
  });
});

describe("runJsEffect", () => {
  it("resolves with the image the effect returns", async () => {
    const { result } = run("function effect(image) { image.data[0] = 1; return image; }");
    const out = await result;
    expect(out.width).toBe(2);
    expect([...out.data.slice(0, 4)]).toEqual([1, 0.5, 0.5, 0.5]);
  });

  it("takes an image the effect makes at another size", async () => {
    const { result } = run("function effect(image) { const o = createImage(3, 2); o.data.fill(0.25); return o; }");
    const out = await result;
    expect([out.width, out.height, out.data.length, out.data[5]]).toEqual([3, 2, 24, 0.25]);
  });

  it("passes the params", async () => {
    const { result } = run("function effect(image, p) { image.data[0] = p.gain * 2; return image; }", { params: { gain: 0.25 } });
    expect((await result).data[0]).toBe(0.5);
  });

  it("gives the helpers", async () => {
    const { result } = run(`function effect(image) {
      const d = image.data;
      d[0] = clamp(2, 0, 1); d[1] = lerp(0, 1, 0.25); d[2] = luma(1, 1, 1);
      d[3] = toSrgb(toLinear(0.5));
      return image;
    }`);
    const d = (await result).data;
    expect(d[0]).toBe(1);
    expect(d[1]).toBe(0.25);
    expect(d[2]).toBeCloseTo(1, 6);
    expect(d[3]).toBeCloseTo(0.5, 6);
  });

  it("lets a script declare its own helper of the same name", async () => {
    const { result } = run("const log = 1; function clamp(x) { return 7; }\nfunction effect(image) { image.data[0] = clamp(0) + log; return image; }");
    expect((await result).data[0]).toBe(8);
  });

  it("makes a new image opaque black", async () => {
    const { result } = run("function effect() { return createImage(1, 1); }");
    expect([...(await result).data]).toEqual([0, 0, 0, 1]);
  });

  it("sends progress at most every 1%, and the last value", async () => {
    const onProgress = vi.fn();
    const { result } = run("function effect(image) { for (let i = 0; i <= 1000; i++) progress(i / 1000); return image; }", { onProgress });
    await result;
    expect(onProgress.mock.calls.length).toBeLessThanOrEqual(102);
    expect(onProgress).toHaveBeenLastCalledWith(1);
  });

  it("caps log lines at 500 a run, saying how many were dropped", async () => {
    const onLog = vi.fn();
    const { result } = run("function effect(image) { for (let i = 0; i < 600; i++) log(i); return image; }", { onLog });
    await result;
    expect(onLog).toHaveBeenCalledTimes(501);
    expect(onLog).toHaveBeenLastCalledWith("… 100 more log lines not shown");
  });

  it("takes the network away before the effect runs", async () => {
    const { result } = run(`function effect(image) {
      const gone = [typeof fetch, typeof XMLHttpRequest, typeof WebSocket, typeof EventSource, typeof importScripts];
      if (gone.some((t) => t !== "undefined")) throw new Error(gone.join());
      return image;
    }`);
    await expect(result).resolves.toBeTruthy();
  });

  it("reports progress and log lines", async () => {
    const onProgress = vi.fn();
    const onLog = vi.fn();
    const { result } = run("function effect(image) { progress(0.5); log('hi', 2, {a: 1}); return image; }", { onProgress, onLog });
    await result;
    expect(onProgress).toHaveBeenCalledWith(0.5);
    expect(onLog).toHaveBeenCalledWith('hi 2 {"a":1}');
  });

  it("rejects with the effect's error and its line in the effect's source", async () => {
    const { result } = run("function effect(image) {\n  return image;\n}\nfunction x() {}\n\nfunction effect(image) {\n  throw new Error('boom');\n}");
    await expect(result).rejects.toThrow("line 7: Error: boom");
  });

  it("rejects a syntax error with its line", async () => {
    const { result } = run("// one\nfunction effect(image) {\n  return image;;;\n  }}\n");
    await expect(result).rejects.toThrow(/^line 4: .*SyntaxError/);
  });

  it("rejects when there is no effect function", async () => {
    const { result } = run("const x = 1;");
    await expect(result).rejects.toThrow("The script has no function effect(image, params)");
  });

  it.each([
    ["nothing", "return undefined;", "effect() must return an image: { width, height, data }"],
    ["a bad size", "return { width: 0, height: 1, data: new Float32Array(0) };", "effect() must return an image: { width, height, data }"],
    ["short data", "return { width: 2, height: 2, data: new Float32Array(4) };", "The image's data must hold width × height × 4 values"],
  ])("rejects a result of %s", async (_, body, message) => {
    const { result } = run(`function effect(image) { ${body} }`);
    await expect(result).rejects.toThrow(message);
  });

  it("takes a plain array of the right length as the data", async () => {
    const { result } = run("function effect() { return { width: 1, height: 1, data: [0.1, 0.2, 0.3, 1] }; }");
    const out = await result;
    expect(out.data).toBeInstanceOf(Float32Array);
    expect(out.data[1]).toBeCloseTo(0.2, 6);
  });

  it("ends the worker past the time limit", async () => {
    const { result, worker } = run("function effect(image) { return new Promise(() => {}); }", { timeoutMs: 30 });
    await expect(result).rejects.toThrow("The script took longer than 0.03 s");
    expect(worker().terminated).toBe(true);
  });

  it("waits for an effect that returns a promise", async () => {
    const { result } = run("async function effect(image) { await null; image.data[0] = 0; return image; }");
    expect((await result).data[0]).toBe(0);
  });

  it("ends the worker when the signal aborts", async () => {
    const controller = new AbortController();
    const { result, worker } = run("function effect() { return new Promise(() => {}); }", { signal: controller.signal });
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(worker().terminated).toBe(true);
  });

  it("ends the worker once it answers", async () => {
    const { result, worker } = run("function effect(image) { return image; }");
    await result;
    expect(worker().terminated).toBe(true);
  });
});
