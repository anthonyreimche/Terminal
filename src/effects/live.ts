// Keeps the registered stages in step with the saved GLSL effects: each one
// that parses is registered (again only when it changed), and the stages of
// effects that went away, or stopped parsing, are taken out.

import type { EffectRecord } from "../library";
import type { ProcessingStageContribution } from "../safelight";
import { buildStage, checkBody, fxStageId } from "./glsl";
import { parseHeader } from "./header";

/** Every GLSL effect runs in thumbnails and exports whatever its Amount, so
 *  their number is held down. */
export const MAX_LIVE_EFFECTS = 24;

export interface StageHost {
  register(stage: ProcessingStageContribution): void;
  unregister(id: string): void;
}

export class LiveEffects {
  private registered = new Map<string, string>();

  constructor(private readonly host: StageHost) {}

  /** Bring the stages in line with `effects`; returns the problems found, one
   *  line each. */
  sync(effects: readonly EffectRecord[]): string[] {
    const problems: string[] = [];
    const wanted = new Map<string, ProcessingStageContribution>();
    for (const effect of effects) {
      if (effect.kind !== "glsl") continue;
      if (wanted.size >= MAX_LIVE_EFFECTS) {
        problems.push(`${effect.name}: only ${MAX_LIVE_EFFECTS} GLSL effects run at once`);
        continue;
      }
      const header = parseHeader(effect.source, "glsl");
      const bad = header.ok ? checkBody(effect.source) : header.errors;
      if (!header.ok || bad.length) {
        problems.push(`${effect.name}: ${bad.map((e) => `line ${e.line}: ${e.message}`).join("; ")}`);
        continue;
      }
      wanted.set(effect.slug, buildStage(effect, header));
    }
    for (const [slug, signature] of this.registered) {
      if (!wanted.has(slug)) {
        this.host.unregister(fxStageId(slug));
        this.registered.delete(slug);
      } else if (signature === signatureOf(wanted.get(slug)!)) {
        wanted.delete(slug);
      }
    }
    for (const [slug, stage] of wanted) {
      this.host.register(stage);
      this.registered.set(slug, signatureOf(stage));
    }
    return problems;
  }

  has(slug: string): boolean {
    return this.registered.has(slug);
  }
}

function signatureOf(stage: ProcessingStageContribution): string {
  return JSON.stringify([stage.name, stage.phase, stage.glsl, stage.uniforms]);
}
