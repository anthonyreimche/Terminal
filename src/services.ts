// The commands' services over the Safelight API.

import type { EditTarget, Services } from "./commands";
import { EFFECTS_PANEL_ID } from "./ids";
import type { LiveEffects } from "./effects/live";
import { runJsEffect } from "./effects/js-runner";
import { runExtensionCommand } from "./extension-commands";
import { readEffects, readEndpoints, writeEffects, writeEndpoints } from "./library";
import { bytesToFloats, decodeImage, encodePng, importBeside } from "./pixels";
import type { CatalogPhoto, ExportSettings, SafelightAPI } from "./safelight";
import { scriptSize, timeLimitSeconds } from "./settings";

export function createServices(api: SafelightAPI, live: LiveEffects, edit: (target: EditTarget) => void, onEffectsSaved: () => void): Services {
  const sessionKeys = new Map<string, string>();
  const keyName = (slug: string) => `key.${slug}`;
  const catalog = () => api.stores.useCatalogStore.getState();
  const developStore = () => api.stores.useDevelopStore.getState();

  const openPhoto = (): CatalogPhoto | null => {
    const id = developStore().photoId;
    return (id && catalog().photos.find((p) => p.id === id)) || null;
  };

  const targets = (): CatalogPhoto[] => {
    const open = openPhoto();
    if (api.stores.useUIStore.getState().activeModule === "develop") return open ? [open] : [];
    const { photos, selectedIds, activePhotoId } = catalog();
    const selected = photos.filter((p) => selectedIds.has(p.id));
    if (selected.length) return selected;
    const active = photos.find((p) => p.id === activePhotoId);
    return active ? [active] : [];
  };

  async function render(photo: CatalogPhoto, settings: Partial<ExportSettings>): Promise<Blob> {
    const [rendered] = await api.export.renderPhotos(
      [photo],
      { colorSpace: "srgb", includeMetadata: false, sharpenAmount: 0, pngBitDepth: 8, ...settings },
      undefined,
      { processors: false },
    );
    if (!rendered?.blob) throw new Error("Safelight couldn't render the photo");
    return rendered.blob;
  }

  const topLevel = () => Object.entries(developStore().params).filter(([, v]) => typeof v === "number" || typeof v === "boolean");

  return {
    effects: () => readEffects(api.settings),
    saveEffects: (effects) => {
      writeEffects(api.settings, effects);
      onEffectsSaved();
    },
    endpoints: () => readEndpoints(api.settings),
    saveEndpoints: (endpoints) => writeEndpoints(api.settings, endpoints),
    isLive: (slug) => live.has(slug),
    edit,
    commands: {
      has: (name) => api.commands.list().some((c) => c.name === name),
      run: (name, words, ctx) => runExtensionCommand(api.commands, name, words, targets(), ctx),
    },

    targets,
    openPhoto,
    displayName: (photo) => api.catalog.photoDisplayName(photo),

    develop: {
      keys: () => [
        ...topLevel().map(([key, v]) => ({ key, label: key, kind: typeof v === "boolean" ? ("boolean" as const) : ("number" as const) })),
        ...api.develop.adjustments.list().map((a) => ({ key: a.key, label: `${a.group}: ${a.label}`, kind: "number" as const })),
        ...api.params
          .list()
          .filter((d) => d.glslType === "float" || d.glslType === "int" || d.glslType === "bool")
          .map((d) => ({
            key: d.qualifiedKey,
            label: `${d.stageName}: ${d.label ?? d.localKey}`,
            kind: d.glslType === "bool" ? ("boolean" as const) : ("number" as const),
          })),
      ],
      get: (key) => {
        const state = developStore();
        if (Object.hasOwn(state.params, key)) return (state.params as unknown as Record<string, unknown>)[key];
        if (api.develop.adjustments.list().some((a) => a.key === key)) return api.develop.adjustments.get(key);
        return state.paramBag[key] ?? api.params.get(key)?.default;
      },
      set: (key, value) => {
        const state = developStore();
        if (Object.hasOwn(state.params, key)) {
          const current = (state.params as unknown as Record<string, unknown>)[key];
          if (typeof current !== typeof value) return false;
          state.setParam(key as keyof typeof state.params, value as never);
          return true;
        }
        if (typeof value === "number" && api.develop.adjustments.list().some((a) => a.key === key)) {
          api.develop.adjustments.set(key, value);
          return true;
        }
        state.setDynParam(key, value);
        return true;
      },
      commit: (label) => developStore().commitEdit(label),
    },
    showEffectsPanel: () => {
      if (!api.dock.isPanelOpen(EFFECTS_PANEL_ID)) api.dock.togglePanel(EFFECTS_PANEL_ID, { direction: "right", width: 280 });
    },

    renderForScript: async (photo) => {
      const size = scriptSize(api.settings);
      const decoded = await decodeImage(await render(photo, { format: "image/png", longEdge: size || null }));
      return bytesToFloats(decoded.data, decoded.width, decoded.height);
    },
    runScript: (source, opts) => runJsEffect(source, opts),
    timeLimitMs: () => timeLimitSeconds(api.settings) * 1000,
    encodePng,
    renderForSend: async (photo, endpoint) => {
      const blob = await render(photo, { format: endpoint.format, longEdge: endpoint.longEdge, quality: endpoint.quality });
      return { bytes: new Uint8Array(await blob.arrayBuffer()), type: endpoint.format };
    },
    importBeside: (photo, data, slug, ext) =>
      importBeside(api.library.importFiles, photo, api.catalog.photoDisplayName(photo), data, slug, ext),

    network: {
      hasAccess: (url) => api.network.hasAccess(url),
      requestAccess: (url) => api.network.requestAccess(url),
      fetch: (url, init) => api.network.fetch(url, init),
    },
    keys: {
      get: async (slug) => {
        const held = sessionKeys.get(slug);
        if (held) return held;
        try {
          return await api.secrets.get(keyName(slug));
        } catch (e) {
          throw new Error(`Couldn't read the key from the keychain: ${e instanceof Error ? e.message : String(e)}`);
        }
      },
      set: async (slug, value) => {
        if (await api.secrets.available().catch(() => false)) {
          await api.secrets.set(keyName(slug), value);
          sessionKeys.delete(slug);
          return true;
        }
        sessionKeys.set(slug, value);
        return false;
      },
      delete: async (slug) => {
        sessionKeys.delete(slug);
        await api.secrets.delete(keyName(slug)).catch(() => undefined);
      },
    },
  };
}
