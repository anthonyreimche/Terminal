// Pixels cross between the 8-bit frames Safelight renders and imports and the
// float images scripts work on; a result lands beside its original under a
// name of its own.

import { describe, expect, it, vi } from "vitest";
import { bytesToFloats, floatsToBytes, importBeside, resultName } from "../src/pixels";
import type { CatalogPhoto, IngestResult } from "../src/safelight";

describe("bytesToFloats / floatsToBytes", () => {
  it("maps 0-255 to 0-1 and back, rounding and clipping", () => {
    const img = bytesToFloats(new Uint8ClampedArray([0, 51, 255, 255]), 1, 1);
    expect([...img.data].map((v) => +v.toFixed(6))).toEqual([0, 0.2, 1, 1]);
    img.data.set([-0.5, 0.5, 1.7, 0.999]);
    expect([...floatsToBytes(img)]).toEqual([0, 128, 255, 255]);
  });

  it("maps NaN to 0", () => {
    expect([...floatsToBytes({ width: 1, height: 1, data: new Float32Array([NaN, 0, 0, 1]) })]).toEqual([0, 0, 0, 255]);
  });
});

describe("resultName", () => {
  it("is the original's base name, the effect's slug and the extension", () => {
    expect(resultName("IMG_0001.NEF", "posterize", "png", 1)).toBe("IMG_0001-posterize.png");
    expect(resultName("IMG_0001.NEF", "posterize", "png", 3)).toBe("IMG_0001-posterize-3.png");
    expect(resultName("noext", "x", "jpg", 1)).toBe("noext-x.jpg");
  });
});

describe("importBeside", () => {
  const photo = { id: "p1", filename: "IMG_1.NEF", folder: "2026/trip" } as CatalogPhoto;

  it("imports into the original's folder", async () => {
    const importFiles = vi.fn(async (files: readonly { name: string }[]): Promise<IngestResult[]> => [{ name: files[0].name, id: "new" }]);
    const blob = new Blob(["x"]);
    expect(await importBeside(importFiles, photo, "IMG_1.NEF", blob, "fade", "png")).toEqual({ ok: true, name: "IMG_1-fade.png", id: "new" });
    expect(importFiles).toHaveBeenCalledWith([{ name: "IMG_1-fade.png", data: blob }], { folder: "2026/trip" });
  });

  it("tries the next number while the name is in use", async () => {
    const importFiles = vi.fn(async (files: readonly { name: string }[]): Promise<IngestResult[]> =>
      files[0].name.endsWith("-3.png") ? [{ name: files[0].name, id: "n" }] : [{ name: files[0].name, error: "“IMG_1-fade.png” already exists in this folder." }],
    );
    expect(await importBeside(importFiles, photo, "IMG_1.NEF", new Blob(), "fade", "png")).toMatchObject({ ok: true, name: "IMG_1-fade-3.png" });
    expect(importFiles).toHaveBeenCalledTimes(3);
  });

  it("gives any other refusal back as it is", async () => {
    const importFiles = vi.fn(async (): Promise<IngestResult[]> => [{ name: "x", error: "The folder is read-only" }]);
    expect(await importBeside(importFiles, photo, "IMG_1.NEF", new Blob(), "fade", "png")).toEqual({ ok: false, error: "The folder is read-only" });
  });
});
