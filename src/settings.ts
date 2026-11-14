// Preferences ▸ Extensions ▸ Terminal.

import type { SafelightAPI, SettingsContribution } from "./safelight";

type Settings = SafelightAPI["settings"];

export const SCRIPT_SIZE = "scriptSize";
export const TIME_LIMIT = "timeLimit";
export const HISTORY = "history";

/** A float image takes 16 bytes a pixel, so scripts get 4096 px by default. */
const DEFAULT_SCRIPT_SIZE = 4096;
const MAX_SCRIPT_SIZE = 16384;

export function scriptSize(settings: Settings): number {
  const v = settings.get<unknown>(SCRIPT_SIZE, DEFAULT_SCRIPT_SIZE);
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.min(MAX_SCRIPT_SIZE, Math.round(v)) : DEFAULT_SCRIPT_SIZE;
}

export function timeLimitSeconds(settings: Settings): number {
  const v = settings.get<unknown>(TIME_LIMIT, 120);
  return typeof v === "number" && Number.isFinite(v) ? Math.min(3600, Math.max(10, v)) : 120;
}

export const settingsContribution: SettingsContribution = {
  title: "Terminal",
  keywords: ["console", "script", "shortcut"],
  fields: [
    {
      key: SCRIPT_SIZE,
      label: "Script render size",
      hint: "Long edge in pixels of the photo a JavaScript effect gets; 0 for the original size. A float image takes 16 bytes a pixel.",
      type: "number",
      default: DEFAULT_SCRIPT_SIZE,
      min: 0,
      max: MAX_SCRIPT_SIZE,
      step: 256,
    },
    {
      key: TIME_LIMIT,
      label: "Script time limit",
      hint: "Seconds a JavaScript effect may take on one photo before it is stopped.",
      type: "number",
      default: 120,
      min: 10,
      max: 3600,
      step: 10,
    },
  ],
};
