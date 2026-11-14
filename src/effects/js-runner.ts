// JavaScript effects run in a worker of their own, built from a blob holding
// the runtime prelude and then the effect's source: the app's policy runs blob
// workers and no eval is needed. The prelude takes the network functions away
// before the source runs, gives the helpers, and answers one message: the
// image and params in, the image the effect returns out.

export interface FloatImage {
  width: number;
  height: number;
  /** RGBA, rows from the top, display-encoded 0 to 1. */
  data: Float32Array;
}

/** What the runner needs of a Worker, so tests can stand one in. */
export interface WorkerLike {
  onmessage: ((e: { data: unknown }) => void) | null;
  onerror: ((e: { message: string; lineno: number; preventDefault(): void }) => void) | null;
  postMessage(data: unknown, transfer?: Transferable[]): void;
  terminate(): void;
}

const PRELUDE = `"use strict";
(() => {
  const names = ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts", "Worker", "SharedWorker"];
  for (const scope of [globalThis, self]) {
    for (let o = scope; o; o = Object.getPrototypeOf(o)) {
      for (const n of names) if (Object.prototype.hasOwnProperty.call(o, n)) try { delete o[n]; } catch {}
    }
    for (const n of names) try { Object.defineProperty(scope, n, { value: undefined, writable: false, configurable: false }); } catch {}
  }
})();
(() => {
  // Helpers are properties of the global object, not declarations, so the
  // script may declare its own of the same name; one it declared as a
  // function is in place before this runs, and is left alone.
  const post = self.postMessage.bind(self);
  const MAX_LOG = 500;
  let logged = 0;
  let lastProgress = -1;
  let lastProgressAt = 0;
  const helpers = {
    clamp: (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x)),
    lerp: (a, b, t) => a + (b - a) * t,
    luma: (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b,
    toLinear: (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)),
    toSrgb: (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055),
    createImage: (width, height) => {
      const data = new Float32Array(width * height * 4);
      for (let i = 3; i < data.length; i += 4) data[i] = 1;
      return { width, height, data };
    },
    progress: (fraction) => {
      const value = Number(fraction);
      const now = Date.now();
      if (value >= 1 || Math.abs(value - lastProgress) >= 0.01 || now - lastProgressAt >= 250) {
        lastProgress = value;
        lastProgressAt = now;
        post({ type: "progress", value });
      }
    },
    log: (...values) => {
      if (++logged <= MAX_LOG) post({ type: "log", text: values.map((v) => (typeof v === "string" ? v : JSON.stringify(v))).join(" ") });
    },
  };
  for (const [name, fn] of Object.entries(helpers)) if (!(name in globalThis)) globalThis[name] = fn;
  self.onmessage = async (event) => {
    const fail = (e) => post({ type: "error", message: e && e.name ? e.name + ": " + e.message : String(e), stack: e && e.stack ? String(e.stack) : "" });
    let fn;
    try { fn = effect; } catch { fn = undefined; }
    if (typeof fn !== "function") return post({ type: "error", message: "The script has no function effect(image, params)", stack: "" });
    let out;
    try { out = await fn(event.data.image, event.data.params); } catch (e) { return fail(e); }
    if (logged > MAX_LOG) post({ type: "log", text: "… " + (logged - MAX_LOG) + " more log lines not shown" });
    if (!out || typeof out !== "object" || !Number.isInteger(out.width) || !Number.isInteger(out.height) || out.width < 1 || out.height < 1)
      return post({ type: "error", message: "effect() must return an image: { width, height, data }", stack: "" });
    if (!out.data || out.data.length !== out.width * out.height * 4)
      return post({ type: "error", message: "The image's data must hold width × height × 4 values", stack: "" });
    const data = out.data instanceof Float32Array ? out.data : Float32Array.from(out.data);
    post({ type: "done", image: { width: out.width, height: out.height, data } }, [data.buffer]);
  };
})();
`;

/** Lines the prelude takes ahead of the effect's source. */
export const PRELUDE_LINES = PRELUDE.split("\n").length - 1;

export function workerSource(source: string): string {
  return PRELUDE + source;
}

function blobWorker(source: string): WorkerLike {
  const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
  const worker = new Worker(url);
  URL.revokeObjectURL(url);
  return worker as unknown as WorkerLike;
}

export interface RunOptions {
  image: FloatImage;
  params: Record<string, number | boolean>;
  timeoutMs: number;
  signal?: AbortSignal;
  onProgress?(fraction: number): void;
  onLog?(text: string): void;
  createWorker?(source: string): WorkerLike;
}

type FromWorker =
  | { type: "progress"; value: number }
  | { type: "log"; text: string }
  | { type: "error"; message: string; stack: string }
  | { type: "done"; image: FloatImage };

export function runJsEffect(source: string, opts: RunOptions): Promise<FloatImage> {
  return new Promise<FloatImage>((resolve, reject) => {
    if (opts.signal?.aborted) return reject(stopped());
    const worker = (opts.createWorker ?? blobWorker)(workerSource(source));
    const finish = (settle: () => void) => {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
      settle();
    };
    const onAbort = () => finish(() => reject(stopped()));
    const timer = setTimeout(
      () => finish(() => reject(new Error(`The script took longer than ${opts.timeoutMs / 1000} s`))),
      opts.timeoutMs,
    );
    opts.signal?.addEventListener("abort", onAbort);
    worker.onerror = (e) => {
      e.preventDefault();
      finish(() => reject(new Error(withLine(e.lineno, e.message))));
    };
    worker.onmessage = ({ data }) => {
      const msg = data as FromWorker;
      if (msg.type === "progress") opts.onProgress?.(msg.value);
      else if (msg.type === "log") opts.onLog?.(msg.text);
      else if (msg.type === "error") finish(() => reject(new Error(withLine(stackLine(msg.stack), msg.message))));
      else if (msg.type === "done") finish(() => resolve(msg.image));
    };
    const { image } = opts;
    worker.postMessage({ image, params: opts.params }, [image.data.buffer]);
  });
}

function stopped(): DOMException {
  return new DOMException("The script was stopped", "AbortError");
}

/** The worker-source line of the first frame in the effect's own code. */
function stackLine(stack: string): number {
  for (const m of stack.matchAll(/blob:\S*?:(\d+):\d+/g)) {
    const line = Number(m[1]);
    if (line > PRELUDE_LINES) return line;
  }
  return 0;
}

function withLine(workerLine: number, message: string): string {
  const line = workerLine - PRELUDE_LINES;
  return line > 0 ? `line ${line}: ${message}` : message;
}
