// A stand-in for a blob Worker: runs the worker program in a fresh Node vm
// context with its own `self`, and passes messages between the two
// asynchronously, as a Worker does. Holds the globals a worker has that the
// prelude must take away, so a test can see they are gone.

import { createContext, runInContext } from "node:vm";
import type { WorkerLike } from "../../src/effects/js-runner";

export interface VmWorker extends WorkerLike {
  terminated: boolean;
}

export function vmWorker(source: string): VmWorker {
  const worker: VmWorker = {
    onmessage: null,
    onerror: null,
    terminated: false,
    postMessage(data: unknown) {
      setTimeout(() => {
        if (!worker.terminated) self.onmessage?.({ data });
      }, 0);
    },
    terminate() {
      worker.terminated = true;
    },
  };
  const self: { onmessage?: (e: { data: unknown }) => void; postMessage(data: unknown): void } & Record<string, unknown> = {
    postMessage(data: unknown) {
      setTimeout(() => {
        if (!worker.terminated) worker.onmessage?.({ data });
      }, 0);
    },
    fetch: () => "network",
    XMLHttpRequest: function XMLHttpRequest() {},
    WebSocket: function WebSocket() {},
    EventSource: function EventSource() {},
    importScripts: () => "imported",
  };
  const context = createContext({ self, Float32Array, Uint8ClampedArray, Math, Number, Array, Object, Error, String, JSON, Date, setTimeout });
  self.self = self;
  for (const name of ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts"]) {
    Object.defineProperty(context, name, { value: self[name], writable: true, configurable: true });
  }
  setTimeout(() => {
    try {
      runInContext(source, context, { filename: "blob:worker" });
    } catch (e) {
      const err = e as Error & { stack?: string };
      const line = /blob:worker:(\d+)/.exec(err.stack ?? "")?.[1];
      worker.onerror?.({ message: `Uncaught ${err.name}: ${err.message}`, lineno: line ? Number(line) : 0, preventDefault() {} });
    }
  }, 0);
  return worker;
}
