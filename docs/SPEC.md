# Terminal — spec (issue #238)

A console docked under the main view, opened and closed with **Ctrl+`**, for
scripted effects and external imaging APIs. Decisions from Anthony
(2026-11-13): both kinds of script effect, generic API endpoints (no vendor
presets), a bottom dock panel, and room left for a G'MIC engine.

Extension id `terminal`, version 1.0.0, minAppVersion 3.2.5 (api.secrets,
`togglePanel` placement). `permissions.userOrigins: true` and no declared
origins.

## 1. The panel and the shortcut

- Panel `terminal.panel`, title "Terminal", `allowBottomDock`, `fill`. No
  `defaultDock`, so no layout seeds it open.
- Keybinding `terminal.toggle`, "Toggle Terminal", category General, default
  `Ctrl+\``. Ctrl combos fire inside text fields, so the shortcut also closes
  the Terminal while its prompt has focus.
- The handler calls `api.dock.togglePanel(PANEL_ID, { direction: "bottom",
  height: 240 })`. **Core seam (3.2.5):** `togglePanel` takes an optional
  placement used when opening a panel that has no `defaultDock` for the
  current module: the first rail on that side, else a new rail with the given
  width/height; a hidden side is shown. Without a placement, behaviour is
  unchanged (float).
- Opening by shortcut focuses the prompt.

### Console behaviour

- Scrollback of lines (`input`, `output`, `error`, `info`), capped at 2000.
  Monospace (`--font-mono`), theme tokens only.
- Enter runs the line. Up/Down walk the history (last 200, kept in settings).
  Tab completes a command or subcommand name (unique prefix, else lists the
  candidates). Ctrl+L clears. Ctrl+C with no text selected cancels the running
  job (AbortSignal); with a selection it copies.
- One job at a time; a line typed while one runs is refused with a message.
- A password prompt mode (`api key`) masks input and keeps it out of the
  history and scrollback.

### Commands

Shell-like words: whitespace splits, `"…"`/`'…'` quote, `\` escapes. `k=v`
words are named arguments.

| Command | Does |
|---|---|
| `help [command]` | lists commands, or one command's usage |
| `clear` | clears the scrollback |
| `photos` | the target photos: the open photo in Develop; the Library selection, else the active photo, elsewhere |
| `get <key>` / `set <key> <value>` | read/write a develop value on the open photo: a top-level numeric/boolean `DevelopParams` field, a nested scalar from `develop.adjustments`, or a qualified extension param (`api.params`). `set` commits one undo step "Terminal" |
| `params [filter]` | lists the keys `get`/`set` know |
| `fx list` | effects, with kind and params |
| `fx new <name> [--glsl\|--js]` | creates one from a template and opens the editor (GLSL default) |
| `fx edit <name>` / `fx rm <name>` | edit / delete |
| `fx apply <name> [amount]` / `fx off <name>` | GLSL: set the effect's Amount on the open photo (default 1) / back to 0, one undo step |
| `run <name> [k=v …]` | JS: run on each target photo, import each result as a new photo beside its original |
| `api list` | endpoints |
| `api new <name>` / `api edit <name>` / `api rm <name>` | endpoint editor / delete (also forgets its key) |
| `api key <name>` | asks for the key (masked), keeps it in `api.secrets` |
| `api send <name> [k=v …]` | send each target photo, import each answer as a new photo beside its original |

Errors never throw out of the console: each prints one `error` line.

## 2. Effects

An effect record `{ name, slug, kind, source }` lives in `api.settings`
(`effects`). `slug` is the name lower-cased, non `[a-z0-9]` runs → `-`,
trimmed, 1–40 chars; names are unique by slug. `kind` is an **engine** id:
`glsl`, `js`, or `gmic`. Engines are a table (`engines.ts`) of
`{ id, label, live, unavailable: string | null, template }`; `gmic` is listed but
answers "G'MIC isn't available yet", so `fx new --gmic` and `run` on one
refuse. A later engine (a G'MIC WASM build, or a native bridge) plugs into the
same table and the same `run` path as JS.

### Header directives (both kinds)

Lines starting `// @` at the top of the source:

```
// @param amount float 0 1 0.5 "Strength"
// @param levels int 2 16 4 Levels
// @param mono bool false Monochrome
// @phase display          (GLSL only: scene | display, default display)
```

`@param <key> <float|int|bool> [min max] <default> [label…]`. Keys are GLSL
identifiers, not starting `fx_` or `gl_`, unique, at most 16 params. Bad lines
are reported with their line number and the effect is not saved.

### GLSL effects (live, non-destructive)

Each saved GLSL effect is registered as stage `terminal.fx.<slug>`:

- `phase` `scene-linear` (variable `lin`, linear Rec.709) for `@phase scene`,
  else `display-adjust` with `space: { encoding: "perceptual" }` (variable `c`).
- The user's body always edits `vec3 c`, a copy. The wrapper (core already braces each stage block):
  `if (fx_amount > 0.0) { vec3 fx_in = <lin|c>; vec3 fx_out; { vec3 c = fx_in;
<body>
fx_out = c; } <lin|c> = mix(fx_in, fx_out, fx_amount); }`.
  The `if` matters: dormancy only drops the stage from the live view on v2+
  photos, while thumbnails, exports and v1 photos run every stage, and
  `mix(a, NaN, 0)` is NaN. The body ends on its own line so a trailing `//`
  comment can't swallow the wrapper.
- Core renames uniform keys by whole-word regex, so GLSL param keys are
  `^[a-z][A-Za-z0-9]*` with no other characters, and not a GLSL keyword,
  builtin or wrapper name (`c`, `lin`, `mix` …). `return`, `discard` and
  `#` lines are refused.
- With `space` set, `c` is unclamped on v2 photos (may be past 0..1).
- Uniforms: `fx_amount` (float 0–1, default 0, label "Amount") plus the
  `@param`s. `dormantWhen: { fx_amount: 0 }` keeps an unused effect out of the
  live view's program. At most 24 GLSL effects are registered.
- Saving re-registers the stage (core recompiles). Deleting unregisters it;
  photos keep their bag keys, which nothing reads.
- Before registering, the body is compiled in a throwaway WebGL2 context with
  stubs for the documented helpers (`luma`, `srgbToLinear`, `linearToSrgb`,
  `linearToSrgbU`) and the uniforms. Core gives stages more helpers than
  these, so an undeclared-identifier error is only a warning; others refuse
  the save, with lines mapped to the user's source. A broken stage that gets
  through is quarantined by core, not fatal. No WebGL2 → saved unchecked,
  with a note.

A Develop panel **Script Effects** (`terminal.effects`, no `defaultDock`)
shows each GLSL effect with an Amount slider and its params (core `Slider`
through `useParamScope`), committed as one undo step per release. `fx apply`
opens it on the right if closed.

### JS effects (destructive, new photo)

Source defines `function effect(image, params) { … }`. `image` is
`{ width, height, data: Float32Array }`: RGBA, rows from the top, sRGB-encoded
0–1. Mutate and return it, or return a new image (any size) made with
`createImage(w, h)`. Helpers in scope: `clamp`, `lerp`, `luma`, `toLinear`,
`toSrgb`, `createImage`, `progress(fraction)`, `log(...values)`.

- Runs in a Worker made from a blob holding the runtime prelude and the
  source (CSP allows `blob:` workers; no `eval` is needed). The prelude
  removes `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`,
  `importScripts` and nested workers before the source runs. That is not a
  security boundary (connect-src is the real limit); pasted scripts run with
  the worker's rights, which the README says.
- Input: `api.export.renderPhotos([photo], { format: "image/png",
  longEdge: <setting, default 4096; 0 = original>, colorSpace: "srgb",
  includeMetadata: false, sharpenAmount: 0 }, undefined, { processors: false })`
  (a float image is 16 bytes a pixel, hence the cap) → bitmap → RGBA8 → floats.
- Output: floats → RGBA8 → PNG → `api.library.importFiles` into the
  original's folder as `<base>-<slug>.png`; a name in use retries
  `-2` … `-99`.
- Timeout per photo (setting, default 120 s) and Ctrl+C terminate the worker.
  A syntax or runtime error prints the message (and line when known) and
  skips the photo; the rest go on.

Params for `run`: `k=v` arguments over the `@param` defaults, coerced to the
declared type and clamped to the range; an unknown key is an error.

## 3. API endpoints

Record (in `api.settings`, `endpoints`):

```ts
{ name, slug, url, method: "POST" | "PUT",
  send: "multipart" | "body" | "json-base64" | "json-data-url",
  field: string,            // multipart field / JSON key of the image, default "image"
  format: "image/jpeg" | "image/png", longEdge: number | null, quality: number,
  fields: Record<string,string>,   // extra multipart/JSON fields
  headers: Record<string,string>,  // extra headers
  auth: { header: string, prefix: string } | null,  // e.g. Authorization / "Bearer "
  reply: "image" | "json", path: string }           // JSON: dot path to base64, data URL or http(s) URL
```

- Values in `url`, `fields` and `headers` may hold `{{name}}` placeholders,
  filled from the `k=v` arguments, plus `{{filename}}` (the photo's). A
  placeholder with no value is an error naming it.
- The key is `api.secrets` `key.<slug>`. Without a keychain it is held in
  memory for the session (a note says so). An endpoint with `auth` and no key
  refuses with "Set a key with: api key <name>".
- Before the first send, `api.network.hasAccess(url)`; if not,
  `requestAccess(url)` (the command came from Enter, a person's action).
  Refused → error. A reply URL on another origin asks the same way.
- Multipart bodies are built by hand (`network.fetch` takes a string or
  bytes). Timeout 5 minutes per request; Ctrl+C aborts.
- A non-2xx answer prints the status and the first 300 characters of the
  body. A reply that isn't a decodable image is an error.
- Answers import like JS results: `<base>-<slug>.<ext from content type>`.

The endpoint editor is a form in the panel (kit `Field`, `TextInput`,
`Select`, `NumberInput`, `TextArea`), Save/Cancel; Save asks for access to
the URL's origin.

## 4. Settings (Preferences ▸ Extensions ▸ Terminal)

- Script render size: long edge in px, 0 = original (default 4096).
- Script time limit per photo: seconds, 10–3600 (default 120).

## 5. Not in 1.0.0

- A G'MIC engine (the table entry is there).
- Async/polling APIs (job id then poll); vendor presets.
- Batch `fx apply` across a Library selection (presets do that).
- Effects in masks.
