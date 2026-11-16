// The languages an effect can be written in. GLSL effects join the develop
// pipeline as live stages; the others run on a photo's pixels and write a new
// photo. G'MIC effects run through the gmic command another extension (G'MIC)
// adds, so they work only while it is installed and on.

export type EffectKind = "glsl" | "js" | "gmic";

export interface Engine {
  id: EffectKind;
  label: string;
  /** Live in the pipeline (GLSL) rather than run once into a new photo. */
  live: boolean;
  /** Why the engine can't be used here, or null. */
  unavailable: string | null;
  template: string;
}

const GLSL_TEMPLATE = `// A live effect: this runs for every pixel, every frame.
// c is the colour, display-encoded (0 to 1, values past 1 kept).
// Write @phase scene above the params to get linear light instead.
// Helpers: luma(c), srgbToLinear(c), linearToSrgb(c).
// @param warmth float -1 1 0.2 Warmth
c *= vec3(1.0 + 0.1 * warmth, 1.0, 1.0 - 0.1 * warmth);
`;

const JS_TEMPLATE = `// Runs once on each photo and imports the result as a new photo.
// image.data holds RGBA floats, rows from the top, display-encoded 0 to 1.
// Helpers: clamp, lerp, luma, toLinear, toSrgb, createImage(w, h),
// progress(fraction), log(...values).
// @param levels int 2 16 4 Levels
function effect(image, params) {
  const n = params.levels - 1;
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = Math.round(d[i] * n) / n;
    d[i + 1] = Math.round(d[i + 1] * n) / n;
    d[i + 2] = Math.round(d[i + 2] * n) / n;
  }
  return image;
}
`;

const GMIC_TEMPLATE = `# Runs once on each photo and imports the result as a new photo.
# Each line is G'MIC words (gmic.eu/reference), run on the photo in turn.
# #@gui lines give it settings, read here as $1, $2 and on.
#@gui : Radius = float(2,0,20)
#@gui : Sharpen = float(40,0,200)
blur $1
sharpen $2
`;

export const ENGINES: Readonly<Record<EffectKind, Engine>> = {
  glsl: { id: "glsl", label: "GLSL", live: true, unavailable: null, template: GLSL_TEMPLATE },
  js: { id: "js", label: "JavaScript", live: false, unavailable: null, template: JS_TEMPLATE },
  gmic: {
    id: "gmic",
    label: "G'MIC",
    live: false,
    unavailable: "G'MIC effects need the G'MIC extension: install it, turn it on and set it up in its panel.",
    template: GMIC_TEMPLATE,
  },
};

export function isEffectKind(value: unknown): value is EffectKind {
  return value === "glsl" || value === "js" || value === "gmic";
}
