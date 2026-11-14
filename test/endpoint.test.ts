// An endpoint is a request the person set up once: where the photo goes, how it
// is packed, the key, and where the answer's image is.

import { describe, expect, it } from "vitest";
import {
  buildRequest,
  defaultEndpoint,
  fillPlaceholders,
  readReply,
  validateEndpoint,
  type Endpoint,
} from "../src/endpoints/endpoint";

const IMAGE = { bytes: new Uint8Array([1, 2, 3, 250]), type: "image/png" };
const TEXT = new TextDecoder();

function endpoint(patch: Partial<Endpoint> = {}): Endpoint {
  return { ...defaultEndpoint("Upscale", "https://api.example.com/v1/{{model}}"), ...patch };
}

describe("fillPlaceholders", () => {
  it("fills {{name}} from the values, spaces inside the braces allowed", () => {
    expect(fillPlaceholders("a {{x}} b {{ y }}", { x: "1", y: "2" })).toEqual({ ok: true, text: "a 1 b 2" });
  });

  it("names every placeholder without a value", () => {
    expect(fillPlaceholders("{{a}}{{b}}{{a}}", {})).toEqual({ ok: false, missing: ["a", "b"] });
  });
});

describe("validateEndpoint", () => {
  it("passes the default endpoint", () => {
    expect(validateEndpoint(endpoint())).toEqual([]);
  });

  it("refuses an address that isn't http or https", () => {
    expect(validateEndpoint(endpoint({ url: "ftp://x" }))).toEqual(["The address must start with http:// or https://"]);
  });

  it("refuses a JSON reply without a path, and a header name with spaces", () => {
    expect(validateEndpoint(endpoint({ reply: "json", path: " ", headers: { "X Y": "1" } }))).toEqual([
      "Say where the image is in the JSON answer",
      "\"X Y\" isn't a header name",
    ]);
  });
});

describe("buildRequest", () => {
  it("fills the address, sends the image as the body with its type, and the key in the auth header", () => {
    const r = buildRequest(endpoint({ send: "body", headers: { Accept: "image/*" } }), IMAGE, { model: "x4" }, "sk-1");
    expect(r).toEqual({
      ok: true,
      url: "https://api.example.com/v1/x4",
      init: {
        method: "POST",
        headers: { Accept: "image/*", "Content-Type": "image/png", Authorization: "Bearer sk-1" },
        body: IMAGE.bytes,
      },
    });
  });

  it("leaves the auth header out when the endpoint has no auth", () => {
    const r = buildRequest(endpoint({ send: "body", auth: null }), IMAGE, { model: "x" }, null);
    expect(r.ok && r.init.headers).toEqual({ "Content-Type": "image/png" });
  });

  it("refuses when the endpoint has auth but there is no key", () => {
    expect(buildRequest(endpoint(), IMAGE, { model: "x" }, null)).toEqual({
      ok: false,
      error: "No key for Upscale. Set one with: api key upscale",
    });
  });

  it("names the placeholders left without a value", () => {
    expect(buildRequest(endpoint({ fields: { p: "{{prompt}}" } }), IMAGE, {}, "k")).toEqual({
      ok: false,
      error: "Give a value for model, prompt (e.g. model=…)",
    });
  });

  it("packs a multipart form: the fields, then the image under its field name", () => {
    const r = buildRequest(
      endpoint({ send: "multipart", field: "image_file", fields: { size: "{{size}}" } }),
      IMAGE,
      { model: "m", size: "auto", filename: "IMG_1.NEF" },
      "k",
    );
    if (!r.ok) throw new Error(r.error);
    const type = r.init.headers["Content-Type"];
    const boundary = /^multipart\/form-data; boundary=(.+)$/.exec(type)?.[1];
    expect(boundary).toBeTruthy();
    const body = r.init.body as Uint8Array;
    const text = TEXT.decode(body.slice(0, body.length - IMAGE.bytes.length - `\r\n--${boundary}--\r\n`.length));
    expect(text).toBe(
      `--${boundary}\r\nContent-Disposition: form-data; name="size"\r\n\r\nauto\r\n` +
        `--${boundary}\r\nContent-Disposition: form-data; name="image_file"; filename="IMG_1.png"\r\n` +
        `Content-Type: image/png\r\n\r\n`,
    );
    expect([...body.slice(body.length - IMAGE.bytes.length - `\r\n--${boundary}--\r\n`.length).slice(0, 4)]).toEqual([1, 2, 3, 250]);
    expect(TEXT.decode(body.slice(-(`\r\n--${boundary}--\r\n`.length)))).toBe(`\r\n--${boundary}--\r\n`);
  });

  it("packs JSON with the image as base64 or a data URL beside the fields", () => {
    const b64 = buildRequest(endpoint({ send: "json-base64", field: "img", fields: { scale: "4" } }), IMAGE, { model: "m" }, "k");
    if (!b64.ok) throw new Error(b64.error);
    expect(b64.init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(b64.init.body as string)).toEqual({ scale: "4", img: "AQID+g==" });
    const url = buildRequest(endpoint({ send: "json-data-url", field: "img" }), IMAGE, { model: "m" }, "k");
    expect(url.ok && JSON.parse(url.init.body as string)).toEqual({ img: "data:image/png;base64,AQID+g==" });
  });

  it("puts a field with a dotted name into nested JSON objects", () => {
    const r = buildRequest(endpoint({ send: "json-base64", field: "input.image", fields: { "input.scale": "2" } }), IMAGE, { model: "m" }, "k");
    expect(r.ok && JSON.parse(r.init.body as string)).toEqual({ input: { scale: "2", image: "AQID+g==" } });
  });
});

describe("buildRequest, hardened", () => {
  it("encodes values filled into the address, not those in fields", () => {
    const r = buildRequest(endpoint({ url: "https://a.example.com/{{model}}?n={{filename}}", send: "json-base64", fields: { f: "{{filename}}" } }), IMAGE, { model: "a/b", filename: "IMG#1 & 50%.jpg" }, "k");
    if (!r.ok) throw new Error(r.error);
    expect(r.url).toBe("https://a.example.com/a%2Fb?n=IMG%231%20%26%2050%25.jpg");
    expect(JSON.parse(r.init.body as string).f).toBe("IMG#1 & 50%.jpg");
  });

  it("never fills a placeholder from an inherited name", () => {
    expect(fillPlaceholders("{{constructor}}", {})).toEqual({ ok: false, missing: ["constructor"] });
  });

  it("lets the person's Content-Type win for a whole-body upload, and drops it otherwise", () => {
    const body = buildRequest(endpoint({ send: "body", auth: null, headers: { "content-type": "application/octet-stream" } }), IMAGE, { model: "m" }, null);
    expect(body.ok && body.init.headers).toEqual({ "content-type": "application/octet-stream" });
    const json = buildRequest(endpoint({ send: "json-base64", auth: null, headers: { "CONTENT-TYPE": "text/plain" } }), IMAGE, { model: "m" }, null);
    expect(json.ok && json.init.headers).toEqual({ "Content-Type": "application/json" });
  });

  it("replaces a header named like the key's, whatever its case", () => {
    const r = buildRequest(endpoint({ send: "body", headers: { authorization: "old" } }), IMAGE, { model: "m" }, "k");
    expect(r.ok && r.init.headers).toEqual({ "Content-Type": "image/png", Authorization: "Bearer k" });
  });

  it("refuses __proto__, constructor and prototype in a JSON path", () => {
    expect(validateEndpoint(endpoint({ send: "json-base64", field: "__proto__.x" }))).toEqual(['"__proto__.x" can\'t name __proto__, constructor or prototype']);
    expect(validateEndpoint(endpoint({ fields: { "a.constructor": "1" } }))).toEqual(['"a.constructor" can\'t name __proto__, constructor or prototype']);
    const r = buildRequest(endpoint({ send: "json-base64", fields: { "__proto__.polluted": "1" } }), IMAGE, { model: "m" }, "k");
    expect(r.ok).toBe(false);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("readReply", () => {
  it("trims the JSON path", async () => {
    const res = new Response(JSON.stringify({ out: "https://x.example.com/a.png" }), { status: 200 });
    expect(await readReply(endpoint({ reply: "json", path: " out " }), res)).toEqual({ kind: "url", url: "https://x.example.com/a.png" });
  });

  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9]);

  it("takes an image answer's bytes, typed by its content type", async () => {
    const res = new Response(png, { status: 200, headers: { "Content-Type": "image/png" } });
    expect(await readReply(endpoint(), res)).toEqual({ kind: "image", bytes: png, type: "image/png" });
  });

  it("types an image answer by its bytes when the content type says nothing useful", async () => {
    const res = new Response(png, { status: 200, headers: { "Content-Type": "application/octet-stream" } });
    expect(await readReply(endpoint(), res)).toMatchObject({ kind: "image", type: "image/png" });
  });

  it("reports a failed answer's status and the start of its body", async () => {
    const res = new Response("x".repeat(400), { status: 401, statusText: "Unauthorized" });
    expect(await readReply(endpoint(), res)).toEqual({ kind: "error", error: `The service answered 401 Unauthorized: ${"x".repeat(300)}…` });
  });

  it("refuses an image answer that isn't an image", async () => {
    const res = new Response("<html>", { status: 200, headers: { "Content-Type": "text/html" } });
    expect(await readReply(endpoint(), res)).toEqual({ kind: "error", error: "The answer isn't an image (text/html)" });
  });

  it("finds base64, a data URL or an address at the JSON path, typing images by their bytes", async () => {
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    const ep = endpoint({ reply: "json", path: "output.0.image" });
    const b64 = btoa(String.fromCharCode(...png));
    expect(await readReply(ep, json({ output: [{ image: b64 }] }))).toEqual({ kind: "image", bytes: png, type: "image/png" });
    expect(await readReply(ep, json({ output: [{ image: `data:image/webp;base64,${b64}` }] }))).toEqual({
      kind: "image",
      bytes: png,
      type: "image/png",
    });
    expect(await readReply(ep, json({ output: [{ image: "https://cdn.example.com/r.png" }] }))).toEqual({
      kind: "url",
      url: "https://cdn.example.com/r.png",
    });
  });

  it("says what is missing when the JSON path leads nowhere", async () => {
    const res = new Response(JSON.stringify({ output: [] }), { status: 200 });
    expect(await readReply(endpoint({ reply: "json", path: "output.0.image" }), res)).toEqual({
      kind: "error",
      error: "The answer has no text at output.0.image",
    });
  });
});
