# Terminal for Safelight

A console under the main view for scripted effects and for imaging services you set up yourself. Press **Ctrl+`** to open or close it, in any module. (Change the shortcut in Preferences ▸ Shortcuts.)

Needs Safelight 3.2.5.

## Commands

Type `help` for the list, or `help <command>` for one. As you type, a list shows what can come next: commands, subcommands, your effects and endpoints, a script's `param=` names, an endpoint's `{{placeholder}}=` names and the develop values `get` and `set` know, each with a line saying what it is. Up and Down move through it, Tab or a click takes one, and Escape closes it (Ctrl+Space opens it again). With no list showing, Up and Down walk your earlier lines. Ctrl+L clears, and Ctrl+C stops a running command.

| Command | What it does |
|---|---|
| `photos` | The photos commands work on: the photo open in Develop, or the Library selection |
| `params [filter]` | The develop values `get` and `set` know |
| `get <key>` / `set <key> <value> …` | Read or change values of the open photo; one `set` is one undo step |
| `fx list` | Your effects |
| `fx new <name> [--glsl\|--js]` | Write a new effect (GLSL by default) |
| `fx edit <name>` / `fx rm <name>` | Change or delete one |
| `fx apply <name> [amount]` / `fx off <name>` | Turn a GLSL effect on (amount 0 to 1) or off on the open photo |
| `run <name> [param=value …]` | Run a JavaScript effect on the photos; each result is a new photo |
| `api list` | Your endpoints |
| `api new <name> [url]` / `api edit <name>` / `api rm <name>` | Set one up, change it, delete it with its key |
| `api key <name>` | Enter the service's key; it is kept by your system's keychain |
| `api send <name> [placeholder=value …]` | Send the photos; each answer is a new photo |

## Effects

An effect starts with `// @` lines that declare its sliders:

```
// @param amount float 0 1 0.5 "Strength"
// @param levels int 2 16 4 Levels
// @param mono bool false Monochrome
```

`@param <name> <float|int|bool> [min max] <default> [label]`. At most 16.

The effect editor suggests as you type too: the helpers below, your params and the names you declare, the language's builtins, the `@` directives and their types and phases, and for JavaScript the members after `params.`, `image.` and `Math.`. Tab takes the highlighted one, Escape closes the list and Ctrl+Space opens it.

### GLSL: live, non-destructive

The code runs for every pixel as you edit, like any develop tool. It changes `c`, the colour. By default `c` is display-encoded (0 to 1, values past 1 kept); write `// @phase scene` to get linear light instead. `luma(c)`, `srgbToLinear(c)`, `linearToSrgb(c)` and `linearToSrgbU(c)` are there to use.

```glsl
// @param warmth float -1 1 0.2 Warmth
c *= vec3(1.0 + 0.1 * warmth, 1.0, 1.0 - 0.1 * warmth);
```

Each effect has an **Amount**, 0 by default, so it changes nothing until you turn it on with `fx apply` or in the **Script Effects** panel (View menu), which also has its sliders. The values are part of the photo's edit: undo, presets, copy and paste, thumbnails and exports carry them. A param's name is letters and digits, starting with a small letter, and can't be a GLSL name (`mix`, `c`, `step` …). `return`, `discard` and `#` lines aren't allowed. Save compiles the code first and shows any error with its line.

At most 24 GLSL effects run at once. Deleting an effect leaves its values in photos' edits, where nothing reads them.

### JavaScript: run once, into a new photo

```js
// @param levels int 2 16 4 Levels
function effect(image, params) {
  const n = params.levels - 1;
  for (let i = 0; i < image.data.length; i += 4) {
    image.data[i] = Math.round(image.data[i] * n) / n;
  }
  return image;
}
```

`image` is `{ width, height, data }`: RGBA floats, rows from the top, display-encoded 0 to 1. Change it and return it, or return a new one of any size made with `createImage(width, height)`. Also there: `clamp`, `lerp`, `luma(r, g, b)`, `toLinear`, `toSrgb`, `progress(fraction)` and `log(...)`. `effect` may be `async`.

`run` renders each photo with its edit (sRGB, no output sharpening, 4096 px on the long edge by default; Preferences ▸ Extensions ▸ Terminal), runs the script, and imports the result as a PNG beside the original: `IMG_0001-posterize.png`. Results are 8 bits a channel.

A script runs in a worker of its own, without the network functions and without access to Safelight. That is a convenience, not a sandbox: only run scripts you trust.

### G'MIC

Not yet. Effects are written for an engine, and a G'MIC engine is planned to run beside JavaScript through the same `run` command.

## Endpoints

An endpoint is an imaging service's address and how it wants the photo: as a form upload, as the whole body, or inside JSON as base64 or a data URL, with any other fields and headers it needs. The answer can be the image itself, or JSON naming where the image is (base64, a data URL, or an address to download it from).

`{{name}}` in the address, fields or headers is filled from `name=value` when you send, and `{{filename}}` is the photo's name:

```
api new upscale https://api.example.com/v1/upscale
api key upscale
api send upscale scale=4
```

Safelight asks you to allow each service's address once, the first time it is used. The key is kept encrypted by your system's keychain (where there is none, only until Safelight closes) and is sent in the header you choose, `Authorization: Bearer …` by default. Services that answer with a job to poll later aren't supported yet.

## Develop

```bash
npm install
npm run check    # typecheck, build, then test
```

## Licence

GPL-3.0-or-later.
