// Between Safelight's 8-bit frames and the float images scripts work on, and
// from a finished image to a new photo beside its original.

import type { FloatImage } from "./effects/js-runner";
import type { CatalogPhoto, SafelightAPI } from "./safelight";

export function bytesToFloats(bytes: Uint8ClampedArray, width: number, height: number): FloatImage {
  const data = new Float32Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) data[i] = bytes[i] / 255;
  return { width, height, data };
}

export function floatsToBytes(image: FloatImage): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(image.data.length);
  for (let i = 0; i < out.length; i++) {
    const v = image.data[i];
    out[i] = Number.isNaN(v) ? 0 : Math.round(v * 255);
  }
  return out;
}

/** Decode an image blob to RGBA8, rows from the top. */
export async function decodeImage(blob: Blob): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {
  const bitmap = await createImageBitmap(blob, { colorSpaceConversion: "none", premultiplyAlpha: "none" });
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d", { colorSpace: "srgb" });
    if (!ctx) throw new Error("No 2D canvas to read the image with");
    ctx.drawImage(bitmap, 0, 0);
    return { width: bitmap.width, height: bitmap.height, data: ctx.getImageData(0, 0, bitmap.width, bitmap.height).data };
  } finally {
    bitmap.close();
  }
}

export async function encodePng(image: FloatImage): Promise<Blob> {
  const canvas = new OffscreenCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d", { colorSpace: "srgb" });
  if (!ctx) throw new Error("No 2D canvas to write the image with");
  ctx.putImageData(new ImageData(floatsToBytes(image), image.width, image.height), 0, 0);
  return canvas.convertToBlob({ type: "image/png" });
}

export function resultName(original: string, slug: string, ext: string, n: number): string {
  const base = original.replace(/\.[^.]*$/, "") || original;
  return `${base}-${slug}${n > 1 ? `-${n}` : ""}.${ext}`;
}

const IN_USE = /already exists/i;
const MAX_TRIES = 99;

export type ImportFiles = SafelightAPI["library"]["importFiles"];

/** Import `data` into the original's folder as "<base>-<slug>.<ext>", taking
 *  "-2" … "-99" while the name is in use. `displayName` is the name the photo
 *  is shown by, so a virtual copy's result carries its copy name. */
export async function importBeside(
  importFiles: ImportFiles,
  photo: CatalogPhoto,
  displayName: string,
  data: Blob,
  slug: string,
  ext: string,
): Promise<{ ok: true; name: string; id: string } | { ok: false; error: string }> {
  for (let n = 1; n <= MAX_TRIES; n++) {
    const name = resultName(displayName, slug, ext, n);
    const [result] = await importFiles([{ name, data }], { folder: photo.folder });
    if (!result) return { ok: false, error: "Nothing was imported" };
    if ("id" in result) return { ok: true, name, id: result.id };
    if (!IN_USE.test(result.error)) return { ok: false, error: result.error };
  }
  return { ok: false, error: `Every name up to ${resultName(displayName, slug, ext, MAX_TRIES)} is in use` };
}
