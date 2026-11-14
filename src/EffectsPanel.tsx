// Script Effects: the sliders of the live GLSL effects, over the open photo.

import type { Observable } from "./console/observable";
import { AMOUNT, fxStageId } from "./effects/glsl";
import { parseHeader, type ParamDecl } from "./effects/header";
import type { EffectRecord } from "./library";
import { React, api } from "./rt";
import type { ParamScope } from "./safelight";

export function makeEffectsPanel(effects: Observable<EffectRecord[]>, isLive: (slug: string) => boolean) {
  return function EffectsPanel() {
    const all = React.useSyncExternalStore(effects.subscribe, effects.get);
    const scope = api.develop.useParamScope();
    const live = all.filter((e) => e.kind === "glsl" && isLive(e.slug));
    const t = api.ui.tokens;
    if (!live.length) {
      return (
        <div style={{ padding: 8, color: t.textMuted, fontSize: 11 }}>
          No live effects yet. Open the Terminal (Ctrl+`) and type fx new &lt;name&gt;.
        </div>
      );
    }
    return (
      <div style={{ padding: "4px 8px 8px" }}>
        {live.map((effect) => (
          <EffectControls key={effect.slug} effect={effect} scope={scope} />
        ))}
      </div>
    );
  };
}

function EffectControls({ effect, scope }: { effect: EffectRecord; scope: ParamScope }) {
  const { Slider } = api.components;
  const { Section, NumberInput, Toggle, Field } = api.ui;
  const header = parseHeader(effect.source, "glsl");
  const stage = fxStageId(effect.slug);
  const key = (k: string) => `${stage}.${k}`;
  const commit = () => scope.commit(`Terminal: ${effect.name}`);
  const params: ParamDecl[] = header.ok ? header.params : [];
  return (
    <Section title={effect.name}>
      <Slider
        label="Amount"
        value={Number(scope.getParam(key(AMOUNT)) ?? 0)}
        min={0}
        max={1}
        step={0.01}
        defaultValue={0}
        onChange={(v) => scope.setParams({ [key(AMOUNT)]: v })}
        onCommit={commit}
      />
      {params.map((p) => {
        const value = scope.getParam(key(p.key)) ?? p.default;
        if (p.type === "bool") {
          return (
            <Toggle
              key={p.key}
              label={p.label}
              checked={value === true}
              onChange={(on) => {
                scope.setParams({ [key(p.key)]: on });
                commit();
              }}
            />
          );
        }
        if (p.min === undefined || p.max === undefined) {
          return (
            <Field key={p.key} label={p.label}>
              <NumberInput
                aria-label={p.label}
                step={p.type === "int" ? 1 : 0.01}
                value={Number(value)}
                onChange={(v) => {
                  scope.setParams({ [key(p.key)]: p.type === "int" ? Math.round(v) : v });
                  commit();
                }}
              />
            </Field>
          );
        }
        return (
          <Slider
            key={p.key}
            label={p.label}
            value={Number(value)}
            min={p.min}
            max={p.max}
            step={p.type === "int" ? 1 : (p.max - p.min) / 200}
            defaultValue={p.default}
            onChange={(v) => scope.setParams({ [key(p.key)]: p.type === "int" ? Math.round(v) : v })}
            onCommit={commit}
          />
        );
      })}
    </Section>
  );
}
