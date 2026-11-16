// The Terminal's commands, over a narrow set of services that index.tsx builds
// from the API, so each command can be tested without the app.

import type { CommandContext, CommandTable } from "./console/terminal";
import { buildRequest, defaultEndpoint, extensionOf, imageReply, readReply, type Endpoint, type SendImage } from "./endpoints/endpoint";
import { ENGINES, type EffectKind } from "./effects/engines";
import { AMOUNT, fxStageId } from "./effects/glsl";
import { coerceParams, parseHeader, slugOf } from "./effects/header";
import type { FloatImage, RunOptions } from "./effects/js-runner";
import type { EffectRecord } from "./library";
import type { CatalogPhoto, NetworkRequestInit } from "./safelight";
import { parseArgs } from "./words";

export type EditTarget = { kind: "effect"; record: EffectRecord; isNew: boolean } | { kind: "endpoint"; record: Endpoint; isNew: boolean };

export interface DevelopKey {
  key: string;
  label: string;
  kind: "number" | "boolean";
}

export interface Services {
  effects(): EffectRecord[];
  saveEffects(effects: EffectRecord[]): void;
  endpoints(): Endpoint[];
  saveEndpoints(endpoints: Endpoint[]): void;
  /** Whether the GLSL effect's stage is registered. */
  isLive(slug: string): boolean;
  edit(target: EditTarget): void;
  /** Other extensions' commands: G'MIC effects run through `gmic`. */
  commands: {
    has(name: string): boolean;
    run(name: string, words: string[], ctx: CommandContext): Promise<void>;
  };

  /** The photos a command works on, and the photo open in Develop. */
  targets(): CatalogPhoto[];
  openPhoto(): CatalogPhoto | null;
  displayName(photo: CatalogPhoto): string;

  develop: {
    keys(): DevelopKey[];
    get(key: string): unknown;
    /** Write a value live; false when the key isn't one get/set know. */
    set(key: string, value: number | boolean): boolean;
    commit(label: string): Promise<void>;
  };
  showEffectsPanel(): void;

  renderForScript(photo: CatalogPhoto): Promise<FloatImage>;
  runScript(source: string, opts: Omit<RunOptions, "createWorker">): Promise<FloatImage>;
  timeLimitMs(): number;
  encodePng(image: FloatImage): Promise<Blob>;
  renderForSend(photo: CatalogPhoto, endpoint: Endpoint): Promise<SendImage>;
  importBeside(photo: CatalogPhoto, data: Blob, slug: string, ext: string): Promise<{ ok: true; name: string } | { ok: false; error: string }>;

  network: {
    hasAccess(url: string): Promise<boolean>;
    requestAccess(url: string): Promise<boolean>;
    fetch(url: string, init: NetworkRequestInit): Promise<Response>;
  };
  keys: {
    get(slug: string): Promise<string | null>;
    /** Keep a key; resolves false when it is only held for this session. */
    set(slug: string, value: string): Promise<boolean>;
    delete(slug: string): Promise<void>;
  };
}

const SEND_TIMEOUT_MS = 5 * 60 * 1000;

/** Whether effects of `kind` can be made and run here. */
function engineReady(services: Services, kind: EffectKind): boolean {
  return kind === "gmic" ? services.commands.has("gmic") : !ENGINES[kind].unavailable;
}

function usage(text: string): never {
  throw new Error(`Usage: ${text}`);
}

function findEffect(services: Services, name: string | undefined, usageText: string): EffectRecord {
  if (!name) usage(usageText);
  const slug = slugOf(name);
  const effect = services.effects().find((e) => e.slug === slug);
  if (!effect) throw new Error(`No effect named "${name}". Type fx list to see them.`);
  return effect;
}

function findEndpoint(services: Services, name: string | undefined, usageText: string): Endpoint {
  if (!name) usage(usageText);
  const slug = slugOf(name);
  const endpoint = services.endpoints().find((e) => e.slug === slug);
  if (!endpoint) throw new Error(`No endpoint named "${name}". Type api list to see them.`);
  return endpoint;
}

function needPhotos(services: Services): CatalogPhoto[] {
  const photos = services.targets();
  if (!photos.length) throw new Error("No photo to work on: select photos in the Library or open one in Develop.");
  return photos;
}

function needOpenPhoto(services: Services): CatalogPhoto {
  const photo = services.openPhoto();
  if (!photo) throw new Error("Open a photo in Develop first.");
  return photo;
}

function parseValue(text: string, kind: DevelopKey["kind"]): number | boolean {
  if (kind === "boolean") {
    if (text === "true" || text === "on") return true;
    if (text === "false" || text === "off") return false;
    throw new Error(`Give true or false, not "${text}"`);
  }
  const n = Number(text);
  if (text.trim() === "" || !Number.isFinite(n)) throw new Error(`Give a number, not "${text}"`);
  return n;
}

function throwIfStopped(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException("Stopped", "AbortError");
}

export function createCommands(services: Services): CommandTable {
  return {
    photos: {
      summary: "the photos commands work on",
      usage: "photos",
      run(ctx) {
        const photos = services.targets();
        if (!photos.length) return ctx.info("None: select photos in the Library or open one in Develop.");
        for (const p of photos) ctx.print(services.displayName(p));
      },
    },

    params: {
      summary: "the develop values get and set know",
      usage: "params [filter]",
      run(ctx, words) {
        const filter = (words[0] ?? "").toLowerCase();
        const keys = services.develop.keys().filter((k) => !filter || k.key.toLowerCase().includes(filter) || k.label.toLowerCase().includes(filter));
        if (!keys.length) return ctx.info("No values match.");
        const width = Math.max(...keys.map((k) => k.key.length));
        for (const k of keys) ctx.print(`${k.key.padEnd(width)}  ${k.label}`);
      },
    },

    get: {
      summary: "read a develop value of the open photo",
      usage: "get <key>",
      run(ctx, words) {
        const [key] = words;
        if (!key) usage("get <key>");
        needOpenPhoto(services);
        if (!services.develop.keys().some((k) => k.key === key)) throw new Error(`Unknown value "${key}". Type params to list them.`);
        ctx.print(String(services.develop.get(key)));
      },
    },

    set: {
      summary: "change a develop value of the open photo (one undo step)",
      usage: "set <key> <value> [<key> <value> …]",
      async run(ctx, words) {
        if (words.length < 2 || words.length % 2) usage("set <key> <value> [<key> <value> …]");
        needOpenPhoto(services);
        const known = services.develop.keys();
        const pairs: [string, number | boolean][] = [];
        for (let i = 0; i < words.length; i += 2) {
          const key = known.find((k) => k.key === words[i]);
          if (!key) throw new Error(`Unknown value "${words[i]}". Type params to list them.`);
          pairs.push([key.key, parseValue(words[i + 1], key.kind)]);
        }
        for (const [key, value] of pairs) services.develop.set(key, value);
        await services.develop.commit("Terminal");
        for (const [key] of pairs) ctx.print(`${key} = ${String(services.develop.get(key))}`);
      },
    },

    fx: {
      summary: "scripted effects: list, new, edit, rm, apply, off",
      usage:
        "fx list\nfx new <name> [--glsl|--js]\nfx edit <name>\nfx rm <name>\nfx apply <name> [amount]   (GLSL, on the open photo)\nfx off <name>",
      subcommands: ["list", "new", "edit", "rm", "apply", "off"],
      async run(ctx, words) {
        const [sub, ...rest] = words;
        const { positional, flags } = parseArgs(rest);
        const name = positional[0];
        switch (sub) {
          case "list":
            return listEffects(ctx, services);
          case "new": {
            if (!name) usage("fx new <name> [--glsl|--js]");
            const slug = slugOf(name);
            if (!slug) throw new Error("Give the effect a name with letters or digits, at most 40 characters.");
            if (services.effects().some((e) => e.slug === slug)) throw new Error(`There is already an effect named "${name}". Use fx edit.`);
            const kind = (["js", "gmic", "glsl"] as const).find((k) => flags.includes(k)) ?? "glsl";
            const engine = ENGINES[kind];
            if (!engineReady(services, kind)) throw new Error(engine.unavailable ?? "");
            services.edit({ kind: "effect", isNew: true, record: { name, slug, kind, source: engine.template } });
            return ctx.info(`Editing ${name} (${engine.label}). Save keeps it.`);
          }
          case "edit": {
            const effect = findEffect(services, name, "fx edit <name>");
            services.edit({ kind: "effect", isNew: false, record: effect });
            return ctx.info(`Editing ${effect.name}.`);
          }
          case "rm": {
            const effect = findEffect(services, name, "fx rm <name>");
            services.saveEffects(services.effects().filter((e) => e.slug !== effect.slug));
            return ctx.print(`Removed ${effect.name}.`);
          }
          case "apply":
          case "off": {
            const effect = findEffect(services, name, `fx ${sub} <name>${sub === "apply" ? " [amount]" : ""}`);
            if (effect.kind !== "glsl") throw new Error(`${effect.name} isn't a live effect: run it with run ${effect.slug}`);
            if (!services.isLive(effect.slug)) throw new Error(`${effect.name} has errors and isn't running. Fix it with fx edit ${effect.slug}.`);
            needOpenPhoto(services);
            let amount = 0;
            if (sub === "apply") {
              amount = positional[1] === undefined ? 1 : Number(positional[1]);
              if (!Number.isFinite(amount)) throw new Error(`Give the amount as a number from 0 to 1, not "${positional[1]}"`);
              amount = Math.min(1, Math.max(0, amount));
            }
            services.develop.set(`${fxStageId(effect.slug)}.${AMOUNT}`, amount);
            await services.develop.commit(`Terminal: ${effect.name}`);
            if (sub === "apply") services.showEffectsPanel();
            return ctx.print(amount > 0 ? `${effect.name} at ${amount}.` : `${effect.name} off.`);
          }
          default:
            usage("fx <list|new|edit|rm|apply|off> …");
        }
      },
    },

    run: {
      summary: "run a script effect on the photos, each into a new photo",
      usage: "run <name> [param=value …]",
      async run(ctx, words) {
        const { positional, named } = parseArgs(words);
        const effect = findEffect(services, positional[0], "run <name> [param=value …]");
        const engine = ENGINES[effect.kind];
        if (engine.live) throw new Error(`${effect.name} is a live effect: use fx apply ${effect.slug}`);
        if (!engineReady(services, effect.kind)) throw new Error(engine.unavailable ?? "");
        if (effect.kind === "gmic") {
          const settings = Object.entries(named).map(([key, value]) => `${key}=${value}`);
          return services.commands.run("gmic", ["script", "--source", effect.source, ...settings], ctx);
        }
        const header = parseHeader(effect.source, effect.kind);
        if (!header.ok) throw new Error(`${effect.name}: ${header.errors.map((e) => `line ${e.line}: ${e.message}`).join("; ")}`);
        const params = coerceParams(header.params, named);
        if (!params.ok) throw new Error(params.errors.join("; "));
        await eachPhoto(ctx, services, effect.slug, async (photo, line) => {
          line.update(`${services.displayName(photo)}: rendering…`);
          const image = await services.renderForScript(photo);
          throwIfStopped(ctx.signal);
          const result = await services.runScript(effect.source, {
            image,
            params: params.values,
            timeoutMs: services.timeLimitMs(),
            signal: ctx.signal,
            onProgress: (f) => line.update(`${services.displayName(photo)}: ${Math.round(Math.min(1, Math.max(0, f)) * 100)}%`),
            onLog: (text) => ctx.print(text),
          });
          return { data: await services.encodePng(result), ext: "png" };
        });
      },
    },

    api: {
      summary: "imaging APIs: list, new, edit, rm, key, send",
      usage: "api list\napi new <name> [url]\napi edit <name>\napi rm <name>\napi key <name>\napi send <name> [placeholder=value …]",
      subcommands: ["list", "new", "edit", "rm", "key", "send"],
      async run(ctx, words) {
        const [sub, ...rest] = words;
        const { positional, named } = parseArgs(rest);
        const name = positional[0];
        switch (sub) {
          case "list": {
            const endpoints = services.endpoints();
            if (!endpoints.length) return ctx.info("No endpoints yet. Add one with: api new <name> <url>");
            for (const e of endpoints) ctx.print(`${e.slug}  ${e.method} ${e.url}`);
            return;
          }
          case "new": {
            if (!name) usage("api new <name> [url]");
            const slug = slugOf(name);
            if (!slug) throw new Error("Give the endpoint a name with letters or digits, at most 40 characters.");
            if (services.endpoints().some((e) => e.slug === slug)) throw new Error(`There is already an endpoint named "${name}". Use api edit.`);
            services.edit({ kind: "endpoint", isNew: true, record: defaultEndpoint(name, positional[1] ?? "https://") });
            return ctx.info(`Setting up ${name}. Save keeps it.`);
          }
          case "edit": {
            const endpoint = findEndpoint(services, name, "api edit <name>");
            services.edit({ kind: "endpoint", isNew: false, record: endpoint });
            return ctx.info(`Editing ${endpoint.name}.`);
          }
          case "rm": {
            const endpoint = findEndpoint(services, name, "api rm <name>");
            services.saveEndpoints(services.endpoints().filter((e) => e.slug !== endpoint.slug));
            await services.keys.delete(endpoint.slug);
            return ctx.print(`Removed ${endpoint.name} and its key.`);
          }
          case "key": {
            const endpoint = findEndpoint(services, name, "api key <name>");
            const value = await ctx.askSecret(`Key for ${endpoint.name}:`);
            if (value === null || !value.trim()) return ctx.info("No key set.");
            const kept = await services.keys.set(endpoint.slug, value.trim());
            return ctx.print(kept ? `Key kept for ${endpoint.name}.` : `Key held for ${endpoint.name} until Safelight closes: this computer has no keychain.`);
          }
          case "send":
            return send(ctx, services, findEndpoint(services, name, "api send <name> [placeholder=value …]"), named);
          default:
            usage("api <list|new|edit|rm|key|send> …");
        }
      },
    },
  };
}

function listEffects(ctx: CommandContext, services: Services): void {
  const effects = services.effects();
  if (!effects.length) return ctx.info("No effects yet. Make one with: fx new <name> [--glsl|--js]");
  for (const e of effects) {
    const header = parseHeader(e.source, e.kind);
    const engine = ENGINES[e.kind];
    const where = engine.live ? (services.isLive(e.slug) ? "live" : "has errors") : "run";
    const params = header.ok && header.params.length ? `  ${header.params.map((p) => p.key).join(", ")}` : "";
    ctx.print(`${e.slug}  ${engine.label}  ${where}${params}`);
  }
}

/** Do `work` for each target photo and import what it makes beside the photo.
 *  A photo that fails is reported and the rest go on; Ctrl+C stops them all. */
async function eachPhoto(
  ctx: CommandContext,
  services: Services,
  slug: string,
  work: (photo: CatalogPhoto, line: ReturnType<CommandContext["progress"]>) => Promise<{ data: Blob; ext: string }>,
): Promise<void> {
  const photos = needPhotos(services);
  let made = 0;
  for (const photo of photos) {
    throwIfStopped(ctx.signal);
    const label = services.displayName(photo);
    const line = ctx.progress(`${label}: starting…`);
    try {
      const { data, ext } = await work(photo, line);
      throwIfStopped(ctx.signal);
      const imported = await services.importBeside(photo, data, slug, ext);
      if (!imported.ok) throw new Error(imported.error);
      made++;
      line.done(`${label} → ${imported.name}`);
    } catch (e) {
      if (ctx.signal.aborted) {
        line.done(`${label}: stopped`);
        throw e;
      }
      line.done(`${label}: failed`);
      ctx.error(`${label}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (photos.length > 1) ctx.info(`${made} of ${photos.length} done.`);
}

/** Make sure `url`'s address is allowed, asking the person if need be. An
 *  address refused once in a command isn't asked about again. */
async function ensureAccess(services: Services, url: string, refused: Set<string>): Promise<void> {
  const origin = new URL(url).origin;
  const no = () => new Error(`Safelight isn't allowed to reach ${origin}.`);
  if (refused.has(origin)) throw no();
  if (await services.network.hasAccess(url)) return;
  if (await services.network.requestAccess(url)) return;
  refused.add(origin);
  throw no();
}

async function send(ctx: CommandContext, services: Services, endpoint: Endpoint, named: Record<string, string>): Promise<void> {
  const key = endpoint.auth ? await services.keys.get(endpoint.slug) : null;
  // What would fail every photo is found before any is rendered: a missing
  // key or placeholder, and an address the person won't allow.
  const trial = buildRequest(endpoint, { bytes: new Uint8Array(), type: endpoint.format }, { ...named, filename: "photo" }, key);
  if (!trial.ok) throw new Error(trial.error);
  needPhotos(services);
  const refused = new Set<string>();
  await ensureAccess(services, trial.url, refused);
  await eachPhoto(ctx, services, endpoint.slug, async (photo, line) => {
    const label = services.displayName(photo);
    line.update(`${label}: rendering…`);
    const image = await services.renderForSend(photo, endpoint);
    const built = buildRequest(endpoint, image, { ...named, filename: label }, key);
    if (!built.ok) throw new Error(built.error);
    if (new URL(built.url).origin !== new URL(trial.url).origin) await ensureAccess(services, built.url, refused);
    line.update(`${label}: sending…`);
    const res = await services.network.fetch(built.url, { ...built.init, timeoutMs: SEND_TIMEOUT_MS, signal: ctx.signal });
    let reply = await readReply(endpoint, res);
    if (reply.kind === "url") {
      await ensureAccess(services, reply.url, refused);
      line.update(`${label}: downloading…`);
      const got = await services.network.fetch(reply.url, { method: "GET", timeoutMs: SEND_TIMEOUT_MS, signal: ctx.signal });
      reply = got.ok
        ? imageReply(new Uint8Array(await got.arrayBuffer()), "")
        : { kind: "error", error: `The image address answered ${got.status}` };
    }
    if (reply.kind === "error") throw new Error(reply.error);
    if (reply.kind !== "image") throw new Error("The answer had no image");
    return { data: new Blob([reply.bytes as BlobPart], { type: reply.type }), ext: extensionOf(reply.type) };
  });
}

