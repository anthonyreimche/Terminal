//#region src/words.ts
function e(e) {
	let t = [], n = "", r = !1, i = null;
	for (let a = 0; a < e.length; a++) {
		let o = e[a];
		i === "'" ? o === "'" ? i = null : n += o : o === "\\" && a + 1 < e.length ? (n += e[++a], r = !0) : i === "\"" ? o === "\"" ? i = null : n += o : o === "'" || o === "\"" ? (i = o, r = !0) : /\s/.test(o) ? (r && t.push(n), n = "", r = !1) : (n += o, r = !0);
	}
	if (i) throw Error(`Unclosed ${i} quote`);
	return r && t.push(n), t;
}
var t = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s, n = /^--([A-Za-z][A-Za-z0-9-]*)$/;
function r(e) {
	let r = {
		positional: [],
		named: {},
		flags: []
	};
	for (let i of e) {
		let e = t.exec(i), a = n.exec(i);
		e ? r.named[e[1]] = e[2] : a ? r.flags.push(a[1]) : r.positional.push(i);
	}
	return r;
}
var i = /^[A-Za-z_][A-Za-z0-9_]*$/, a = /^[a-z][A-Za-z0-9]*$/, o = new Set("c lin src srcUv vUv uv main luma srgbToLinear linearToSrgb linearToSrgbU rgb2hsl hsl2rgb attribute const uniform varying layout centroid flat smooth break continue do for while switch case default if else in out inout float int uint void bool true false invariant discard return struct precision lowp mediump highp vec2 vec3 vec4 ivec2 ivec3 ivec4 uvec2 uvec3 uvec4 bvec2 bvec3 bvec4 mat2 mat3 mat4 sampler2D sampler3D samplerCube radians degrees sin cos tan asin acos atan sinh cosh tanh pow exp log exp2 log2 sqrt inversesqrt abs sign floor trunc round roundEven ceil fract mod modf min max clamp mix step smoothstep isnan isinf length distance dot cross normalize faceforward reflect refract matrixCompMult outerProduct transpose determinant inverse lessThan lessThanEqual greaterThan greaterThanEqual equal notEqual any all not texture textureLod texelFetch textureSize dFdx dFdy fwidth".split(" "));
function s(e) {
	let t = e.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
	return t && t.length <= 40 ? t : null;
}
function c(e, t) {
	let n = [], r = [], i = "display", a = e.split(/\r?\n/);
	for (let e = 0; e < a.length; e++) {
		let o = a[e].trim();
		if (o === "") continue;
		if (!o.startsWith("//")) break;
		let s = /^\/\/\s*@(\S+)\s*(.*)$/.exec(o);
		if (!s) continue;
		let c = (t) => r.push({
			line: e + 1,
			message: t
		}), [, u, d] = s;
		if (u === "phase") t === "glsl" ? d.trim() === "scene" || d.trim() === "display" ? i = d.trim() : c("phase must be scene or display") : c("@phase is for GLSL effects");
		else if (u === "param") {
			let e = l(d, n, t);
			typeof e == "string" ? c(e) : n.length >= 16 ? c("at most 16 params") : n.push(e);
		} else c(`unknown directive @${u}`);
	}
	return r.length ? {
		ok: !1,
		errors: r
	} : {
		ok: !0,
		phase: i,
		params: n
	};
}
function l(t, n, r) {
	let s;
	try {
		s = e(t);
	} catch (e) {
		return e.message;
	}
	let [c, l, ...d] = s;
	if (!c || !i.test(c)) return `"${c ?? ""}" isn't a name`;
	if (/^(fx_|gl_)/.test(c)) return "names starting fx_ or gl_ are reserved";
	if (r === "glsl" && o.has(c)) return `"${c}" is a GLSL name; pick another`;
	if (r === "glsl" && !a.test(c)) return "a GLSL param's name is letters and digits, starting with a small letter";
	if (n.some((e) => e.key === c)) return `"${c}" is declared twice`;
	if (l === "bool") {
		let [e, ...t] = d;
		return e === void 0 ? "needs a default" : e !== "true" && e !== "false" ? "a bool's default is true or false" : {
			key: c,
			type: l,
			default: e === "true",
			label: t.join(" ") || c
		};
	}
	if (l !== "float" && l !== "int") return "type must be float, int or bool";
	let f = [];
	for (; f.length < 3 && d.length && u(d[0]);) f.push(Number(d.shift()));
	let p = d.join(" ") || c;
	if (f.length === 0) return "needs a default";
	if (f.length === 2) return "give min, max and default, or only a default";
	if (l === "int" && !f.every(Number.isInteger)) return "an int's values must be whole numbers";
	if (f.length === 1) return {
		key: c,
		type: l,
		default: f[0],
		label: p
	};
	let [m, h, g] = f;
	return m < h ? g < m || g > h ? `default must be within ${m} to ${h}` : {
		key: c,
		type: l,
		min: m,
		max: h,
		default: g,
		label: p
	} : "min must be below max";
}
function u(e) {
	return e.trim() !== "" && Number.isFinite(Number(e));
}
function d(e, t) {
	let n = {}, r = [];
	for (let n of Object.keys(t)) e.some((e) => e.key === n) || r.push(`unknown param "${n}"`);
	for (let i of e) {
		let e = t[i.key];
		if (e === void 0) n[i.key] = i.default;
		else if (i.type === "bool") e === "true" || e === "false" ? n[i.key] = e === "true" : r.push(`${i.key} must be true or false`);
		else if (!u(e)) r.push(`${i.key} must be a number`);
		else {
			let t = Number(e);
			i.type === "int" && (t = Math.round(t)), i.min !== void 0 && (t = Math.max(i.min, t)), i.max !== void 0 && (t = Math.min(i.max, t)), n[i.key] = t;
		}
	}
	return r.length ? {
		ok: !1,
		errors: r
	} : {
		ok: !0,
		values: n
	};
}
//#endregion
//#region src/endpoints/endpoint.ts
function f(e, t) {
	return {
		name: e,
		slug: s(e) ?? "",
		url: t,
		method: "POST",
		send: "multipart",
		field: "image",
		format: "image/jpeg",
		longEdge: 2048,
		quality: .92,
		fields: {},
		headers: {},
		auth: {
			header: "Authorization",
			prefix: "Bearer "
		},
		reply: "image",
		path: ""
	};
}
var p = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
function m(e) {
	let t = [];
	e.slug || t.push("Give the endpoint a name with letters or digits"), /^https?:\/\/[^/\s]+/i.test(e.url.trim()) || t.push("The address must start with http:// or https://"), !e.field.trim() && e.send !== "body" && t.push("Name the field the image goes in"), e.reply === "json" && !e.path.trim() && t.push("Say where the image is in the JSON answer");
	for (let n of [...Object.keys(e.headers), ...e.auth ? [e.auth.header] : []]) p.test(n) || t.push(`"${n}" isn't a header name`);
	e.longEdge !== null && !(Number.isInteger(e.longEdge) && e.longEdge >= 16) && t.push("The size must be 16 px or more");
	for (let n of [e.field, ...Object.keys(e.fields)]) g(n) && t.push(`"${n}" can't name __proto__, constructor or prototype`);
	return t;
}
var h = /* @__PURE__ */ new Set([
	"__proto__",
	"constructor",
	"prototype"
]), g = (e) => e.split(".").some((e) => h.has(e)), _ = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;
function v(e, t) {
	let n = [], r = e.replace(_, (e, r) => Object.hasOwn(t, r) ? t[r] : (n.includes(r) || n.push(r), e));
	return n.length ? {
		ok: !1,
		missing: n
	} : {
		ok: !0,
		text: r
	};
}
function y(e, t, n, r) {
	let i = [], a = (e, t = !1) => {
		let r = v(e, t ? b(n) : n);
		if (r.ok) return r.text;
		for (let e of r.missing) i.includes(e) || i.push(e);
		return e;
	}, o = a(e.url.trim(), !0), s = Object.entries(e.fields).map(([e, t]) => [e, a(t)]), c = {};
	for (let [t, n] of Object.entries(e.headers)) c[t] = a(n);
	if (i.length) return {
		ok: !1,
		error: `Give a value for ${i.join(", ")} (e.g. ${i[0]}=…)`
	};
	if (e.auth && !r) return {
		ok: !1,
		error: `No key for ${e.name}. Set one with: api key ${e.slug}`
	};
	if (e.send !== "multipart" && e.send !== "body" && [e.field, ...s.map(([e]) => e)].some(g)) return {
		ok: !1,
		error: "A JSON key can't name __proto__, constructor or prototype"
	};
	let l;
	if (e.send === "body") S(c, "Content-Type") || (c["Content-Type"] = t.type), l = t.bytes;
	else if (e.send === "multipart") {
		let r = `----SafelightTerminal${ne()}`;
		C(c, "Content-Type", `multipart/form-data; boundary=${r}`), l = w(r, s, e.field, ee(n.filename, t.type), t);
	} else {
		let n = {};
		for (let [e, t] of s) te(n, e, t);
		let r = re(t.bytes);
		te(n, e.field, e.send === "json-data-url" ? `data:${t.type};base64,${r}` : r), C(c, "Content-Type", "application/json"), l = JSON.stringify(n);
	}
	return e.auth && r && C(c, e.auth.header, `${e.auth.prefix}${r}`), {
		ok: !0,
		url: o,
		init: {
			method: e.method,
			headers: c,
			body: l
		}
	};
}
function b(e) {
	return Object.fromEntries(Object.entries(e).map(([e, t]) => [e, encodeURIComponent(t)]));
}
var x = (e, t) => e.toLowerCase() === t.toLowerCase();
function S(e, t) {
	return Object.keys(e).some((e) => x(e, t));
}
function C(e, t, n) {
	for (let n of Object.keys(e)) x(n, t) && delete e[n];
	e[t] = n;
}
function w(e, t, n, r, i) {
	let a = new TextEncoder(), o = "";
	for (let [n, r] of t) o += `--${e}\r\nContent-Disposition: form-data; name="${T(n)}"\r\n\r\n${r}\r\n`;
	o += `--${e}\r\nContent-Disposition: form-data; name="${T(n)}"; filename="${T(r)}"\r\nContent-Type: ${i.type}\r\n\r\n`;
	let s = [
		a.encode(o),
		i.bytes,
		a.encode(`\r\n--${e}--\r\n`)
	], c = new Uint8Array(s.reduce((e, t) => e + t.length, 0)), l = 0;
	for (let e of s) c.set(e, l), l += e.length;
	return c;
}
function T(e) {
	return e.replace(/["\r\n\\]/g, "_");
}
function ee(e, t) {
	return `${(e ?? "photo").replace(/\.[^./\\]*$/, "") || "photo"}.${E(t)}`;
}
function E(e) {
	switch (e) {
		case "image/jpeg": return "jpg";
		case "image/webp": return "webp";
		case "image/tiff": return "tif";
		case "image/avif": return "avif";
		case "image/gif": return "gif";
		default: return "png";
	}
}
function te(e, t, n) {
	let r = t.split("."), i = e;
	for (let e of r.slice(0, -1)) {
		let t = i[e];
		i = i[e] = typeof t == "object" && t ? t : {};
	}
	i[r[r.length - 1]] = n;
}
function ne() {
	let e = /* @__PURE__ */ new Uint8Array(12);
	return crypto.getRandomValues(e), [...e].map((e) => e.toString(16).padStart(2, "0")).join("");
}
function re(e) {
	let t = "";
	for (let n = 0; n < e.length; n += 32768) t += String.fromCharCode(...e.subarray(n, n + 32768));
	return btoa(t);
}
function ie(e) {
	try {
		let t = atob(e.replace(/\s+/g, "")), n = new Uint8Array(t.length);
		for (let e = 0; e < t.length; e++) n[e] = t.charCodeAt(e);
		return n;
	} catch {
		return null;
	}
}
function ae(e) {
	let t = (t, ...n) => n.every((n, r) => e[t + r] === n), n = (e, n) => t(e, ...[...n].map((e) => e.charCodeAt(0)));
	return t(0, 137, 80, 78, 71) ? "image/png" : t(0, 255, 216, 255) ? "image/jpeg" : n(0, "RIFF") && n(8, "WEBP") ? "image/webp" : n(0, "GIF8") ? "image/gif" : t(0, 73, 73, 42, 0) || t(0, 77, 77, 0, 42) ? "image/tiff" : n(4, "ftypavif") || n(4, "ftypavis") ? "image/avif" : null;
}
var D = 300;
async function oe(e, t) {
	if (!t.ok) {
		let e = (await t.text().catch(() => "")).trim(), n = e.length > D ? `${e.slice(0, D)}…` : e;
		return {
			kind: "error",
			error: `The service answered ${`${t.status}${t.statusText ? ` ${t.statusText}` : ""}`}${n ? `: ${n}` : ""}`
		};
	}
	let n = (t.headers.get("Content-Type") ?? "").split(";")[0].trim().toLowerCase();
	if (e.reply === "image") return O(new Uint8Array(await t.arrayBuffer()), n);
	let r;
	try {
		r = await t.json();
	} catch {
		return {
			kind: "error",
			error: "The answer isn't JSON"
		};
	}
	let i = e.path.trim(), a = i.split(".").reduce((e, t) => typeof e == "object" && e && Object.hasOwn(e, t) ? e[t] : void 0, r);
	if (typeof a != "string" || !a) return {
		kind: "error",
		error: `The answer has no text at ${i}`
	};
	if (/^https?:\/\//i.test(a)) return {
		kind: "url",
		url: a
	};
	let o = /^data:([^;,]+)(?:;[^,]*)?;base64,(.*)$/s.exec(a), s = ie(o ? o[2] : a);
	return s ? O(s, o ? o[1].toLowerCase() : "") : {
		kind: "error",
		error: `The text at ${i} is neither an address nor base64`
	};
}
function O(e, t) {
	let n = ae(e);
	return n ? {
		kind: "image",
		bytes: e,
		type: n
	} : {
		kind: "error",
		error: `The answer isn't an image${t ? ` (${t})` : ""}`
	};
}
var k = {
	glsl: {
		id: "glsl",
		label: "GLSL",
		live: !0,
		unavailable: null,
		template: "// A live effect: this runs for every pixel, every frame.\n// c is the colour, display-encoded (0 to 1, values past 1 kept).\n// Write @phase scene above the params to get linear light instead.\n// Helpers: luma(c), srgbToLinear(c), linearToSrgb(c).\n// @param warmth float -1 1 0.2 Warmth\nc *= vec3(1.0 + 0.1 * warmth, 1.0, 1.0 - 0.1 * warmth);\n"
	},
	js: {
		id: "js",
		label: "JavaScript",
		live: !1,
		unavailable: null,
		template: "// Runs once on each photo and imports the result as a new photo.\n// image.data holds RGBA floats, rows from the top, display-encoded 0 to 1.\n// Helpers: clamp, lerp, luma, toLinear, toSrgb, createImage(w, h),\n// progress(fraction), log(...values).\n// @param levels int 2 16 4 Levels\nfunction effect(image, params) {\n  const n = params.levels - 1;\n  const d = image.data;\n  for (let i = 0; i < d.length; i += 4) {\n    d[i] = Math.round(d[i] * n) / n;\n    d[i + 1] = Math.round(d[i + 1] * n) / n;\n    d[i + 2] = Math.round(d[i + 2] * n) / n;\n  }\n  return image;\n}\n"
	},
	gmic: {
		id: "gmic",
		label: "G'MIC",
		live: !1,
		unavailable: "G'MIC effects need the G'MIC extension: install it, turn it on and set it up in its panel.",
		template: "# Runs once on each photo and imports the result as a new photo.\n# Each line is G'MIC words (gmic.eu/reference), run on the photo in turn.\n# #@gui lines give it settings, read here as $1, $2 and on.\n#@gui : Radius = float(2,0,20)\n#@gui : Sharpen = float(40,0,200)\nblur $1\nsharpen $2\n"
	}
};
function se(e) {
	return e === "glsl" || e === "js" || e === "gmic";
}
//#endregion
//#region src/ids.ts
var A = "terminal", j = `${A}.panel`, M = `${A}.effects`, ce = `${A}.toggle`, le = "Ctrl+`", N = "fx_amount";
function P(e) {
	return `${A}.fx.${e}`;
}
function ue(e, t) {
	let n = t.phase === "scene" ? "lin" : "c", r = [
		`if (${N} > 0.0) {`,
		`vec3 fx_in = ${n};`,
		"vec3 fx_out;",
		"{",
		"vec3 c = fx_in;",
		e.source,
		"fx_out = c;",
		"}",
		`${n} = mix(fx_in, fx_out, ${N});`,
		"}"
	].join("\n"), i = [{
		key: N,
		glslType: "float",
		default: 0,
		range: {
			min: 0,
			max: 1,
			step: .01
		},
		label: "Amount"
	}, ...t.params.map((e) => {
		if (e.type === "bool") return {
			key: e.key,
			glslType: "bool",
			default: e.default,
			label: e.label
		};
		let t = e.min !== void 0 && e.max !== void 0 ? { range: {
			min: e.min,
			max: e.max
		} } : {};
		return {
			key: e.key,
			glslType: e.type,
			default: e.default,
			...t,
			label: e.label
		};
	})];
	return {
		id: P(e.slug),
		name: e.name,
		...t.phase === "scene" ? { phase: "scene-linear" } : {
			phase: "display-adjust",
			space: { encoding: "perceptual" }
		},
		presetScope: "global",
		dormantWhen: { [N]: 0 },
		uniforms: i,
		glsl: r
	};
}
function de(e) {
	let t = [];
	return fe(e).split("\n").forEach((e, n) => {
		let r = n + 1;
		/^\s*#/.test(e) && t.push({
			line: r,
			message: "# lines aren't allowed in an effect"
		}), /\breturn\b/.test(e) && t.push({
			line: r,
			message: "return would end the whole program; set c instead"
		}), /\bdiscard\b/.test(e) && t.push({
			line: r,
			message: "discard isn't allowed in an effect"
		});
	}), t;
}
function fe(e) {
	return e.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (e) => e.replace(/[^\n]/g, " "));
}
var pe = "float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }\nvec3 srgbToLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c)); }\nvec3 linearToSrgbU(vec3 c) { c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }\nvec3 linearToSrgb(vec3 c) { return clamp(linearToSrgbU(c), 0.0, 1.0); }";
function me(e, t) {
	let n = [
		"#version 300 es",
		"precision highp float;",
		...e.uniforms.map((e) => `uniform ${e.glslType} ${e.key};`),
		pe,
		"out vec4 fx_frag;",
		"void main() {",
		"vec3 c = vec3(0.5);",
		"vec3 lin = c;"
	].join("\n"), r = t(`${n}\n${e.glsl}\nfx_frag = vec4(c + lin, 1.0);\n}\n`), i = {
		errors: [],
		warnings: []
	};
	if (!r) return i;
	let a = n.split("\n").length + 6, o = e.glsl.split("\n").length - 5 - 4;
	for (let e of r.matchAll(/^ERROR:\s*\d+:(\d+):\s*(.*)$/gm)) {
		let t = Number(e[1]) - a + 1, n = {
			line: t >= 1 && t <= o ? t : 0,
			message: e[2].trim()
		};
		(/undeclared identifier|no matching overloaded function/.test(n.message) ? i.warnings : i.errors).push(n);
	}
	return !i.errors.length && !i.warnings.length && i.errors.push({
		line: 0,
		message: r.trim()
	}), i;
}
function he() {
	if (typeof OffscreenCanvas > "u") return null;
	let e = new OffscreenCanvas(1, 1).getContext("webgl2");
	return e ? (t) => {
		let n = e.createShader(e.FRAGMENT_SHADER);
		if (!n) return null;
		try {
			return e.shaderSource(n, t), e.compileShader(n), e.getShaderParameter(n, e.COMPILE_STATUS) ? null : e.getShaderInfoLog(n) || "The shader didn't compile";
		} finally {
			e.deleteShader(n);
		}
	} : null;
}
//#endregion
//#region src/commands.ts
var ge = 3e5;
function _e(e, t) {
	return t === "gmic" ? e.commands.has("gmic") : !k[t].unavailable;
}
function F(e) {
	throw Error(`Usage: ${e}`);
}
function I(e, t, n) {
	t || F(n);
	let r = s(t), i = e.effects().find((e) => e.slug === r);
	if (!i) throw Error(`No effect named "${t}". Type fx list to see them.`);
	return i;
}
function L(e, t, n) {
	t || F(n);
	let r = s(t), i = e.endpoints().find((e) => e.slug === r);
	if (!i) throw Error(`No endpoint named "${t}". Type api list to see them.`);
	return i;
}
function R(e) {
	let t = e.targets();
	if (!t.length) throw Error("No photo to work on: select photos in the Library or open one in Develop.");
	return t;
}
function z(e) {
	let t = e.openPhoto();
	if (!t) throw Error("Open a photo in Develop first.");
	return t;
}
function ve(e, t) {
	if (t === "boolean") {
		if (e === "true" || e === "on") return !0;
		if (e === "false" || e === "off") return !1;
		throw Error(`Give true or false, not "${e}"`);
	}
	let n = Number(e);
	if (e.trim() === "" || !Number.isFinite(n)) throw Error(`Give a number, not "${e}"`);
	return n;
}
function B(e) {
	if (e.aborted) throw new DOMException("Stopped", "AbortError");
}
function ye(e) {
	return {
		photos: {
			summary: "the photos commands work on",
			usage: "photos",
			run(t) {
				let n = e.targets();
				if (!n.length) return t.info("None: select photos in the Library or open one in Develop.");
				for (let r of n) t.print(e.displayName(r));
			}
		},
		params: {
			summary: "the develop values get and set know",
			usage: "params [filter]",
			run(t, n) {
				let r = (n[0] ?? "").toLowerCase(), i = e.develop.keys().filter((e) => !r || e.key.toLowerCase().includes(r) || e.label.toLowerCase().includes(r));
				if (!i.length) return t.info("No values match.");
				let a = Math.max(...i.map((e) => e.key.length));
				for (let e of i) t.print(`${e.key.padEnd(a)}  ${e.label}`);
			}
		},
		get: {
			summary: "read a develop value of the open photo",
			usage: "get <key>",
			run(t, n) {
				let [r] = n;
				if (r || F("get <key>"), z(e), !e.develop.keys().some((e) => e.key === r)) throw Error(`Unknown value "${r}". Type params to list them.`);
				t.print(String(e.develop.get(r)));
			}
		},
		set: {
			summary: "change a develop value of the open photo (one undo step)",
			usage: "set <key> <value> [<key> <value> …]",
			async run(t, n) {
				(n.length < 2 || n.length % 2) && F("set <key> <value> [<key> <value> …]"), z(e);
				let r = e.develop.keys(), i = [];
				for (let e = 0; e < n.length; e += 2) {
					let t = r.find((t) => t.key === n[e]);
					if (!t) throw Error(`Unknown value "${n[e]}". Type params to list them.`);
					i.push([t.key, ve(n[e + 1], t.kind)]);
				}
				for (let [t, n] of i) e.develop.set(t, n);
				await e.develop.commit("Terminal");
				for (let [n] of i) t.print(`${n} = ${String(e.develop.get(n))}`);
			}
		},
		fx: {
			summary: "scripted effects: list, new, edit, rm, apply, off",
			usage: "fx list\nfx new <name> [--glsl|--js]\nfx edit <name>\nfx rm <name>\nfx apply <name> [amount]   (GLSL, on the open photo)\nfx off <name>",
			subcommands: [
				"list",
				"new",
				"edit",
				"rm",
				"apply",
				"off"
			],
			async run(t, n) {
				let [i, ...a] = n, { positional: o, flags: c } = r(a), l = o[0];
				switch (i) {
					case "list": return be(t, e);
					case "new": {
						l || F("fx new <name> [--glsl|--js]");
						let n = s(l);
						if (!n) throw Error("Give the effect a name with letters or digits, at most 40 characters.");
						if (e.effects().some((e) => e.slug === n)) throw Error(`There is already an effect named "${l}". Use fx edit.`);
						let r = [
							"js",
							"gmic",
							"glsl"
						].find((e) => c.includes(e)) ?? "glsl", i = k[r];
						if (!_e(e, r)) throw Error(i.unavailable ?? "");
						return e.edit({
							kind: "effect",
							isNew: !0,
							record: {
								name: l,
								slug: n,
								kind: r,
								source: i.template
							}
						}), t.info(`Editing ${l} (${i.label}). Save keeps it.`);
					}
					case "edit": {
						let n = I(e, l, "fx edit <name>");
						return e.edit({
							kind: "effect",
							isNew: !1,
							record: n
						}), t.info(`Editing ${n.name}.`);
					}
					case "rm": {
						let n = I(e, l, "fx rm <name>");
						return e.saveEffects(e.effects().filter((e) => e.slug !== n.slug)), t.print(`Removed ${n.name}.`);
					}
					case "apply":
					case "off": {
						let n = I(e, l, `fx ${i} <name>${i === "apply" ? " [amount]" : ""}`);
						if (n.kind !== "glsl") throw Error(`${n.name} isn't a live effect: run it with run ${n.slug}`);
						if (!e.isLive(n.slug)) throw Error(`${n.name} has errors and isn't running. Fix it with fx edit ${n.slug}.`);
						z(e);
						let r = 0;
						if (i === "apply") {
							if (r = o[1] === void 0 ? 1 : Number(o[1]), !Number.isFinite(r)) throw Error(`Give the amount as a number from 0 to 1, not "${o[1]}"`);
							r = Math.min(1, Math.max(0, r));
						}
						return e.develop.set(`${P(n.slug)}.${N}`, r), await e.develop.commit(`Terminal: ${n.name}`), i === "apply" && e.showEffectsPanel(), t.print(r > 0 ? `${n.name} at ${r}.` : `${n.name} off.`);
					}
					default: F("fx <list|new|edit|rm|apply|off> …");
				}
			}
		},
		run: {
			summary: "run a script effect on the photos, each into a new photo",
			usage: "run <name> [param=value …]",
			async run(t, n) {
				let { positional: i, named: a } = r(n), o = I(e, i[0], "run <name> [param=value …]"), s = k[o.kind];
				if (s.live) throw Error(`${o.name} is a live effect: use fx apply ${o.slug}`);
				if (!_e(e, o.kind)) throw Error(s.unavailable ?? "");
				if (o.kind === "gmic") {
					let n = Object.entries(a).map(([e, t]) => `${e}=${t}`);
					return e.commands.run("gmic", [
						"script",
						"--source",
						o.source,
						...n
					], t);
				}
				let l = c(o.source, o.kind);
				if (!l.ok) throw Error(`${o.name}: ${l.errors.map((e) => `line ${e.line}: ${e.message}`).join("; ")}`);
				let u = d(l.params, a);
				if (!u.ok) throw Error(u.errors.join("; "));
				await xe(t, e, o.slug, async (n, r) => {
					r.update(`${e.displayName(n)}: rendering…`);
					let i = await e.renderForScript(n);
					B(t.signal);
					let a = await e.runScript(o.source, {
						image: i,
						params: u.values,
						timeoutMs: e.timeLimitMs(),
						signal: t.signal,
						onProgress: (t) => r.update(`${e.displayName(n)}: ${Math.round(Math.min(1, Math.max(0, t)) * 100)}%`),
						onLog: (e) => t.print(e)
					});
					return {
						data: await e.encodePng(a),
						ext: "png"
					};
				});
			}
		},
		api: {
			summary: "imaging APIs: list, new, edit, rm, key, send",
			usage: "api list\napi new <name> [url]\napi edit <name>\napi rm <name>\napi key <name>\napi send <name> [placeholder=value …]",
			subcommands: [
				"list",
				"new",
				"edit",
				"rm",
				"key",
				"send"
			],
			async run(t, n) {
				let [i, ...a] = n, { positional: o, named: c } = r(a), l = o[0];
				switch (i) {
					case "list": {
						let n = e.endpoints();
						if (!n.length) return t.info("No endpoints yet. Add one with: api new <name> <url>");
						for (let e of n) t.print(`${e.slug}  ${e.method} ${e.url}`);
						return;
					}
					case "new": {
						l || F("api new <name> [url]");
						let n = s(l);
						if (!n) throw Error("Give the endpoint a name with letters or digits, at most 40 characters.");
						if (e.endpoints().some((e) => e.slug === n)) throw Error(`There is already an endpoint named "${l}". Use api edit.`);
						return e.edit({
							kind: "endpoint",
							isNew: !0,
							record: f(l, o[1] ?? "https://")
						}), t.info(`Setting up ${l}. Save keeps it.`);
					}
					case "edit": {
						let n = L(e, l, "api edit <name>");
						return e.edit({
							kind: "endpoint",
							isNew: !1,
							record: n
						}), t.info(`Editing ${n.name}.`);
					}
					case "rm": {
						let n = L(e, l, "api rm <name>");
						return e.saveEndpoints(e.endpoints().filter((e) => e.slug !== n.slug)), await e.keys.delete(n.slug), t.print(`Removed ${n.name} and its key.`);
					}
					case "key": {
						let n = L(e, l, "api key <name>"), r = await t.askSecret(`Key for ${n.name}:`);
						if (r === null || !r.trim()) return t.info("No key set.");
						let i = await e.keys.set(n.slug, r.trim());
						return t.print(i ? `Key kept for ${n.name}.` : `Key held for ${n.name} until Safelight closes: this computer has no keychain.`);
					}
					case "send": return Se(t, e, L(e, l, "api send <name> [placeholder=value …]"), c);
					default: F("api <list|new|edit|rm|key|send> …");
				}
			}
		}
	};
}
function be(e, t) {
	let n = t.effects();
	if (!n.length) return e.info("No effects yet. Make one with: fx new <name> [--glsl|--js]");
	for (let r of n) {
		let n = c(r.source, r.kind), i = k[r.kind], a = i.live ? t.isLive(r.slug) ? "live" : "has errors" : "run", o = n.ok && n.params.length ? `  ${n.params.map((e) => e.key).join(", ")}` : "";
		e.print(`${r.slug}  ${i.label}  ${a}${o}`);
	}
}
async function xe(e, t, n, r) {
	let i = R(t), a = 0;
	for (let o of i) {
		B(e.signal);
		let i = t.displayName(o), s = e.progress(`${i}: starting…`);
		try {
			let { data: c, ext: l } = await r(o, s);
			B(e.signal);
			let u = await t.importBeside(o, c, n, l);
			if (!u.ok) throw Error(u.error);
			a++, s.done(`${i} → ${u.name}`);
		} catch (t) {
			if (e.signal.aborted) throw s.done(`${i}: stopped`), t;
			s.done(`${i}: failed`), e.error(`${i}: ${t instanceof Error ? t.message : String(t)}`);
		}
	}
	i.length > 1 && e.info(`${a} of ${i.length} done.`);
}
async function V(e, t, n) {
	let r = new URL(t).origin, i = () => /* @__PURE__ */ Error(`Safelight isn't allowed to reach ${r}.`);
	if (n.has(r)) throw i();
	if (!await e.network.hasAccess(t) && !await e.network.requestAccess(t)) throw n.add(r), i();
}
async function Se(e, t, n, r) {
	let i = n.auth ? await t.keys.get(n.slug) : null, a = y(n, {
		bytes: /* @__PURE__ */ new Uint8Array(),
		type: n.format
	}, {
		...r,
		filename: "photo"
	}, i);
	if (!a.ok) throw Error(a.error);
	R(t);
	let o = /* @__PURE__ */ new Set();
	await V(t, a.url, o), await xe(e, t, n.slug, async (s, c) => {
		let l = t.displayName(s);
		c.update(`${l}: rendering…`);
		let u = y(n, await t.renderForSend(s, n), {
			...r,
			filename: l
		}, i);
		if (!u.ok) throw Error(u.error);
		new URL(u.url).origin !== new URL(a.url).origin && await V(t, u.url, o), c.update(`${l}: sending…`);
		let d = await oe(n, await t.network.fetch(u.url, {
			...u.init,
			timeoutMs: ge,
			signal: e.signal
		}));
		if (d.kind === "url") {
			await V(t, d.url, o), c.update(`${l}: downloading…`);
			let n = await t.network.fetch(d.url, {
				method: "GET",
				timeoutMs: ge,
				signal: e.signal
			});
			d = n.ok ? O(new Uint8Array(await n.arrayBuffer()), "") : {
				kind: "error",
				error: `The image address answered ${n.status}`
			};
		}
		if (d.kind === "error") throw Error(d.error);
		if (d.kind !== "image") throw Error("The answer had no image");
		return {
			data: new Blob([d.bytes], { type: d.type }),
			ext: E(d.type)
		};
	});
}
//#endregion
//#region src/console/observable.ts
var H = class {
	value;
	listeners = /* @__PURE__ */ new Set();
	constructor(e) {
		this.value = e;
	}
	get = () => this.value;
	set(e) {
		this.value = e;
		for (let e of this.listeners) e();
	}
	subscribe = (e) => (this.listeners.add(e), () => this.listeners.delete(e));
};
//#endregion
//#region src/console/terminal.ts
function U(e) {
	return typeof e == "function" ? e() : e;
}
var Ce = class {
	commands;
	options;
	snapshot;
	listeners = /* @__PURE__ */ new Set();
	nextId = 1;
	job = null;
	secret = null;
	cursor;
	draft = "";
	constructor(e, t = {}) {
		this.commands = e, this.options = t;
		let n = (t.history ?? []).slice(-200);
		this.snapshot = {
			lines: [],
			history: n,
			busy: !1,
			prompt: null
		}, this.cursor = n.length;
	}
	subscribe = (e) => (this.listeners.add(e), () => this.listeners.delete(e));
	getSnapshot = () => this.snapshot;
	set(e) {
		this.snapshot = {
			...this.snapshot,
			...e
		};
		for (let e of this.listeners) e();
	}
	push(e, t) {
		let n = this.nextId++, r = this.options.maxLines ?? 2e3;
		return this.set({ lines: [...this.snapshot.lines, {
			id: n,
			kind: e,
			text: t
		}].slice(-r) }), n;
	}
	replace(e, t) {
		this.set({ lines: this.snapshot.lines.map((n) => n.id === e ? {
			...n,
			text: t
		} : n) });
	}
	write(e, t) {
		for (let n of t.split("\n")) this.push(e, n);
	}
	clear() {
		this.set({ lines: [] });
	}
	async submit(t) {
		if (this.secret) {
			let e = this.secret;
			this.secret = null, this.push("info", `${this.snapshot.prompt?.label ?? ""} ${"•".repeat(Math.min(6, t.length))}`), this.set({ prompt: null }), e(t);
			return;
		}
		if (!t.trim()) return;
		if (this.push("input", t), this.remember(t), this.job) {
			this.push("error", "Wait for the running command, or press Ctrl+C to stop it.");
			return;
		}
		let n;
		try {
			n = e(t);
		} catch (e) {
			this.push("error", e.message);
			return;
		}
		let [r, ...i] = n;
		if (r === "help") return this.help(i[0]);
		if (r === "clear") return this.clear();
		let a = U(this.commands), o = Object.hasOwn(a, r) ? a[r] : void 0;
		if (!o) {
			this.push("error", `Unknown command "${r}". Type help for the list.`);
			return;
		}
		let s = new AbortController();
		this.job = s, this.set({ busy: !0 });
		try {
			await o.run(this.context(s.signal), i);
		} catch (e) {
			s.signal.aborted ? this.push("info", "Stopped.") : this.write("error", e instanceof Error ? e.message : String(e));
		} finally {
			this.job = null, this.set({
				busy: !1,
				prompt: null
			}), this.secret = null;
		}
	}
	cancel() {
		if (this.secret) {
			let e = this.secret;
			this.secret = null, this.set({ prompt: null }), e(null);
		} else this.job?.abort();
	}
	context(e) {
		return {
			signal: e,
			print: (e) => this.write("output", e),
			error: (e) => this.write("error", e),
			info: (e) => this.write("info", e),
			progress: (e) => {
				let t = this.push("info", e);
				return {
					update: (e) => this.replace(t, e),
					done: (e) => {
						e !== void 0 && this.replace(t, e);
					}
				};
			},
			askSecret: (e) => new Promise((t) => {
				this.secret = t, this.set({ prompt: {
					label: e,
					secret: !0
				} });
			})
		};
	}
	help(e) {
		let t = U(this.commands);
		if (e) {
			let n = Object.hasOwn(t, e) ? t[e] : void 0;
			if (!n) {
				this.push("error", `Unknown command "${e}".`);
				return;
			}
			this.push("output", n.usage), n.summary && this.push("output", n.summary);
			return;
		}
		let n = [
			...Object.entries(t).map(([e, t]) => [e, t.summary]),
			["help", "list the commands, or help <command>"],
			["clear", "clear the console (Ctrl+L)"]
		], r = Math.max(...n.map(([e]) => e.length));
		for (let [e, t] of n) this.push("output", `  ${e.padEnd(r)}  ${t}`);
	}
	remember(e) {
		let t = this.snapshot.history, n = t[t.length - 1] === e ? t : [...t, e].slice(-200);
		this.cursor = n.length, this.draft = "", n !== t && (this.set({ history: n }), this.options.saveHistory?.(n));
	}
	historyStep(e, t) {
		let n = this.snapshot.history;
		return this.cursor === n.length && (this.draft = t), this.cursor = Math.max(0, Math.min(n.length, this.cursor + e)), this.cursor === n.length ? this.draft : n[this.cursor];
	}
}, we = {
	fx: {
		list: "your effects",
		new: "write a new effect",
		edit: "change an effect",
		rm: "delete an effect",
		apply: "turn a GLSL effect on for the open photo",
		off: "turn a GLSL effect off for the open photo"
	},
	api: {
		list: "your endpoints",
		new: "set up an endpoint",
		edit: "change an endpoint",
		rm: "delete an endpoint and its key",
		key: "enter an endpoint's key",
		send: "send the photos"
	}
}, Te = [{
	label: "help",
	insert: "help ",
	detail: "list the commands, or help <command>"
}, {
	label: "clear",
	insert: "clear ",
	detail: "clear the console (Ctrl+L)"
}], Ee = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;
function De(e, t, n) {
	let r = t;
	for (; r > 0 && !/\s/.test(e[r - 1]);) r--;
	let i = t;
	for (; i < e.length && !/\s/.test(e[i]);) i++;
	let a = e.slice(r, t), o = e.slice(0, r).trim(), s = o ? o.split(/\s+/) : [], c = e.slice(i).trim(), l = ke(a, Ae(s, [...s, ...c ? c.split(/\s+/) : []], a, n)), u = l.length === 1 && l[0].insert.trim() === a ? [] : l;
	return {
		from: r,
		to: i,
		items: u
	};
}
function Oe(e, t, n) {
	let r = e.slice(t.to), i = /^\s/.test(r) ? n.insert.trimEnd() : n.insert, a = t.from + i.length + (/^\s/.test(r) && i !== n.insert ? 1 : 0);
	return {
		text: e.slice(0, t.from) + i + r,
		cursor: a
	};
}
function ke(e, t) {
	let n = e.toLowerCase();
	if (!n) return t;
	let r = t.filter((e) => e.label.toLowerCase().startsWith(n)), i = t.filter((e) => !e.label.toLowerCase().startsWith(n) && e.label.toLowerCase().includes(n));
	return [...r, ...i];
}
function Ae(e, t, n, r) {
	let [i, a] = e, o = e.length;
	if (o === 0) return n ? [...Object.entries(U(r.commands)).map(([e, t]) => ({
		label: e,
		insert: `${e} `,
		detail: t.summary
	})), ...Te] : [];
	if (i === "help") return o === 1 ? Object.entries(U(r.commands)).map(([e, t]) => ({
		label: e,
		insert: `${e} `,
		detail: t.summary
	})) : [];
	if (i === "fx") return je(o, a, t, r);
	if (i === "run") {
		if (o === 1) return W(r.effects().filter((e) => !k[e.kind].live && Ne(e.kind, r)));
		let i = r.effects().find((t) => t.slug === e[1]), a = i && i.kind !== "gmic" ? c(i.source, i.kind) : null;
		return a?.ok ? Re(a.params, t, n) : [];
	}
	if (i === "api") return Me(o, a, e, t, r);
	if (i === "get") return o === 1 ? Fe(r.developKeys()) : [];
	if (i === "set") return o % 2 == 1 ? Fe(r.developKeys()) : r.developKeys().find((t) => t.key === e[o - 1])?.kind === "boolean" ? [Ie("true"), Ie("false")] : [];
	let s = U(r.commands)[i];
	return o === 1 && s?.subcommands ? s.subcommands.map((e) => ({
		label: e,
		insert: `${e} `
	})) : [];
}
function je(e, t, n, r) {
	if (e === 1) return Pe("fx", r);
	let i = r.effects();
	return e === 2 && (t === "edit" || t === "rm") ? W(i) : e === 2 && (t === "apply" || t === "off") ? W(i.filter((e) => e.kind === "glsl")) : e >= 3 && t === "new" ? [
		"glsl",
		"js",
		"gmic"
	].filter((e) => Ne(e, r) && !n.includes(`--${e}`)).map((e) => ({
		label: `--${e}`,
		insert: `--${e} `,
		detail: k[e].label
	})) : [];
}
function Me(e, t, n, r, i) {
	if (e === 1) return Pe("api", i);
	let a = i.endpoints();
	if (e === 2 && t && [
		"edit",
		"rm",
		"key",
		"send"
	].includes(t)) return a.map((e) => ({
		label: e.slug,
		insert: `${e.slug} `,
		detail: e.url
	}));
	if (e >= 3 && t === "send") {
		let e = a.find((e) => e.slug === n[2]);
		if (!e) return [];
		let t = [];
		for (let n of [
			e.url,
			...Object.values(e.fields),
			...Object.values(e.headers)
		]) for (let e of n.matchAll(Ee)) e[1] !== "filename" && !t.includes(e[1]) && t.push(e[1]);
		return t.filter((e) => !Le(r, e)).map((e) => ({
			label: `${e}=`,
			insert: `${e}=`,
			detail: "placeholder"
		}));
	}
	return [];
}
function Ne(e, t) {
	return e === "gmic" ? Object.hasOwn(U(t.commands), "gmic") : !k[e].unavailable;
}
function Pe(e, t) {
	return (U(t.commands)[e]?.subcommands ?? []).map((t) => ({
		label: t,
		insert: `${t} `,
		detail: we[e]?.[t]
	}));
}
function W(e) {
	return e.map((e) => ({
		label: e.slug,
		insert: `${e.slug} `,
		detail: k[e.kind].label
	}));
}
function Fe(e) {
	return e.map((e) => ({
		label: e.key,
		insert: `${e.key} `,
		detail: e.label === e.key ? void 0 : e.label
	}));
}
function Ie(e) {
	return {
		label: e,
		insert: `${e} `
	};
}
function Le(e, t) {
	return e.some((e) => e.startsWith(`${t}=`));
}
function Re(e, t, n) {
	let r = n.indexOf("=");
	if (r > 0) {
		let t = e.find((e) => e.key === n.slice(0, r));
		return t?.type === "bool" ? ["true", "false"].map((e) => ({
			label: `${t.key}=${e}`,
			insert: `${t.key}=${e} `
		})) : [];
	}
	return e.filter((e) => !Le(t, e.key)).map((e) => ({
		label: `${e.key}=`,
		insert: `${e.key}=`,
		detail: ze(e)
	}));
}
function ze(e) {
	if (e.type === "bool") return `bool, default ${e.default}`;
	let t = e.min !== void 0 && e.max !== void 0 ? ` ${e.min} to ${e.max}` : "";
	return `${e.type}${t}, default ${e.default}`;
}
var Be = class {
	host;
	registered = /* @__PURE__ */ new Map();
	constructor(e) {
		this.host = e;
	}
	sync(e) {
		let t = [], n = /* @__PURE__ */ new Map();
		for (let r of e) {
			if (r.kind !== "glsl") continue;
			if (n.size >= 24) {
				t.push(`${r.name}: only 24 GLSL effects run at once`);
				continue;
			}
			let e = c(r.source, "glsl"), i = e.ok ? de(r.source) : e.errors;
			!e.ok || i.length ? t.push(`${r.name}: ${i.map((e) => `line ${e.line}: ${e.message}`).join("; ")}`) : n.set(r.slug, ue(r, e));
		}
		for (let [e, t] of this.registered) n.has(e) ? t === Ve(n.get(e)) && n.delete(e) : (this.host.unregister(P(e)), this.registered.delete(e));
		for (let [e, t] of n) this.host.register(t), this.registered.set(e, Ve(t));
		return t;
	}
	has(e) {
		return this.registered.has(e);
	}
};
function Ve(e) {
	return JSON.stringify([
		e.name,
		e.phase,
		e.glsl,
		e.uniforms
	]);
}
//#endregion
//#region src/rt.ts
var G, K;
function He(e) {
	K = e, G = e.react;
}
//#endregion
//#region src/EffectsPanel.tsx
function Ue(e, t) {
	return function() {
		let n = G.useSyncExternalStore(e.subscribe, e.get), r = K.develop.useParamScope(), i = n.filter((e) => e.kind === "glsl" && t(e.slug)), a = K.ui.tokens;
		return i.length ? /* @__PURE__ */ G.createElement("div", { style: { padding: "4px 8px 8px" } }, i.map((e) => /* @__PURE__ */ G.createElement(We, {
			key: e.slug,
			effect: e,
			scope: r
		}))) : /* @__PURE__ */ G.createElement("div", { style: {
			padding: 8,
			color: a.textMuted,
			fontSize: 11
		} }, "No live effects yet. Open the Terminal (Ctrl+`) and type fx new <name>.");
	};
}
function We({ effect: e, scope: t }) {
	let { Slider: n } = K.components, { Section: r, NumberInput: i, Toggle: a, Field: o } = K.ui, s = c(e.source, "glsl"), l = P(e.slug), u = (e) => `${l}.${e}`, d = () => t.commit(`Terminal: ${e.name}`), f = s.ok ? s.params : [];
	return /* @__PURE__ */ G.createElement(r, { title: e.name }, /* @__PURE__ */ G.createElement(n, {
		label: "Amount",
		value: Number(t.getParam(u("fx_amount")) ?? 0),
		min: 0,
		max: 1,
		step: .01,
		defaultValue: 0,
		onChange: (e) => t.setParams({ [u(N)]: e }),
		onCommit: d
	}), f.map((e) => {
		let r = t.getParam(u(e.key)) ?? e.default;
		return e.type === "bool" ? /* @__PURE__ */ G.createElement(a, {
			key: e.key,
			label: e.label,
			checked: r === !0,
			onChange: (n) => {
				t.setParams({ [u(e.key)]: n }), d();
			}
		}) : e.min === void 0 || e.max === void 0 ? /* @__PURE__ */ G.createElement(o, {
			key: e.key,
			label: e.label
		}, /* @__PURE__ */ G.createElement(i, {
			"aria-label": e.label,
			step: e.type === "int" ? 1 : .01,
			value: Number(r),
			onChange: (n) => {
				t.setParams({ [u(e.key)]: e.type === "int" ? Math.round(n) : n }), d();
			}
		})) : /* @__PURE__ */ G.createElement(n, {
			key: e.key,
			label: e.label,
			value: Number(r),
			min: e.min,
			max: e.max,
			step: e.type === "int" ? 1 : (e.max - e.min) / 200,
			defaultValue: e.default,
			onChange: (n) => t.setParams({ [u(e.key)]: e.type === "int" ? Math.round(n) : n }),
			onCommit: d
		});
	}));
}
//#endregion
//#region src/extension-commands.ts
async function Ge(e, t, n, r, i) {
	await e.run(t, {
		words: n,
		photos: r,
		signal: i.signal,
		print: i.print,
		info: i.info,
		warn: i.error,
		progress: i.progress
	});
}
function Ke(e, t, n) {
	let r = {};
	for (let i of e.list()) n.includes(i.name) || Object.hasOwn(r, i.name) || (r[i.name] = {
		summary: i.summary,
		usage: i.usage.join("\n"),
		subcommands: i.subcommands.map((e) => e.name),
		run: (n, r) => Ge(e, i.name, r, t(), n)
	});
	return r;
}
//#endregion
//#region src/library.ts
var q = "effects", qe = "endpoints", J = (e) => typeof e == "object" && !!e && !Array.isArray(e), Y = (e) => typeof e == "string", Je = (e) => J(e) ? Object.fromEntries(Object.entries(e).filter((e) => Y(e[1]))) : {};
function X(e) {
	let t = e.get(q, []);
	if (!Array.isArray(t)) return [];
	let n = /* @__PURE__ */ new Set(), r = [];
	for (let e of t) {
		if (!J(e) || !Y(e.name) || !Y(e.source) || !se(e.kind)) continue;
		let t = s(e.name);
		t && !n.has(t) && (n.add(t), r.push({
			name: e.name,
			slug: t,
			kind: e.kind,
			source: e.source
		}));
	}
	return r;
}
function Ye(e, t) {
	e.set(q, t.map(({ name: e, kind: t, source: n }) => ({
		name: e,
		kind: t,
		source: n
	})));
}
var Xe = [
	"multipart",
	"body",
	"json-base64",
	"json-data-url"
], Ze = ["image", "json"], Qe = ["image/jpeg", "image/png"];
function $e(e) {
	if (!J(e) || !Y(e.name) || !Y(e.url)) return null;
	let t = f(e.name, e.url);
	if (!t.slug) return null;
	let n = e.auth === null ? null : J(e.auth) && Y(e.auth.header) ? {
		header: e.auth.header,
		prefix: Y(e.auth.prefix) ? e.auth.prefix : ""
	} : t.auth;
	return {
		...t,
		method: e.method === "PUT" ? "PUT" : "POST",
		send: Xe.includes(e.send) ? e.send : t.send,
		field: Y(e.field) ? e.field : t.field,
		format: Qe.includes(e.format) ? e.format : t.format,
		longEdge: e.longEdge === null ? null : typeof e.longEdge == "number" && e.longEdge >= 16 ? Math.round(e.longEdge) : t.longEdge,
		quality: typeof e.quality == "number" ? Math.min(1, Math.max(.1, e.quality)) : t.quality,
		fields: Je(e.fields),
		headers: Je(e.headers),
		auth: n,
		reply: Ze.includes(e.reply) ? e.reply : t.reply,
		path: Y(e.path) ? e.path : ""
	};
}
function et(e) {
	let t = e.get(qe, []);
	if (!Array.isArray(t)) return [];
	let n = /* @__PURE__ */ new Set();
	return t.map($e).filter((e) => !!e && !n.has(e.slug) && !!n.add(e.slug));
}
function tt(e, t) {
	e.set(qe, t.map(({ slug: e, ...t }) => t));
}
//#endregion
//#region src/effects/js-runner.ts
var nt = "\"use strict\";\n(() => {\n  const names = [\"fetch\", \"XMLHttpRequest\", \"WebSocket\", \"EventSource\", \"importScripts\", \"Worker\", \"SharedWorker\"];\n  for (const scope of [globalThis, self]) {\n    for (let o = scope; o; o = Object.getPrototypeOf(o)) {\n      for (const n of names) if (Object.prototype.hasOwnProperty.call(o, n)) try { delete o[n]; } catch {}\n    }\n    for (const n of names) try { Object.defineProperty(scope, n, { value: undefined, writable: false, configurable: false }); } catch {}\n  }\n})();\n(() => {\n  // Helpers are properties of the global object, not declarations, so the\n  // script may declare its own of the same name; one it declared as a\n  // function is in place before this runs, and is left alone.\n  const post = self.postMessage.bind(self);\n  const MAX_LOG = 500;\n  let logged = 0;\n  let lastProgress = -1;\n  let lastProgressAt = 0;\n  const helpers = {\n    clamp: (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x)),\n    lerp: (a, b, t) => a + (b - a) * t,\n    luma: (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b,\n    toLinear: (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)),\n    toSrgb: (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055),\n    createImage: (width, height) => {\n      const data = new Float32Array(width * height * 4);\n      for (let i = 3; i < data.length; i += 4) data[i] = 1;\n      return { width, height, data };\n    },\n    progress: (fraction) => {\n      const value = Number(fraction);\n      const now = Date.now();\n      if (value >= 1 || Math.abs(value - lastProgress) >= 0.01 || now - lastProgressAt >= 250) {\n        lastProgress = value;\n        lastProgressAt = now;\n        post({ type: \"progress\", value });\n      }\n    },\n    log: (...values) => {\n      if (++logged <= MAX_LOG) post({ type: \"log\", text: values.map((v) => (typeof v === \"string\" ? v : JSON.stringify(v))).join(\" \") });\n    },\n  };\n  for (const [name, fn] of Object.entries(helpers)) if (!(name in globalThis)) globalThis[name] = fn;\n  self.onmessage = async (event) => {\n    const fail = (e) => post({ type: \"error\", message: e && e.name ? e.name + \": \" + e.message : String(e), stack: e && e.stack ? String(e.stack) : \"\" });\n    let fn;\n    try { fn = effect; } catch { fn = undefined; }\n    if (typeof fn !== \"function\") return post({ type: \"error\", message: \"The script has no function effect(image, params)\", stack: \"\" });\n    let out;\n    try { out = await fn(event.data.image, event.data.params); } catch (e) { return fail(e); }\n    if (logged > MAX_LOG) post({ type: \"log\", text: \"… \" + (logged - MAX_LOG) + \" more log lines not shown\" });\n    if (!out || typeof out !== \"object\" || !Number.isInteger(out.width) || !Number.isInteger(out.height) || out.width < 1 || out.height < 1)\n      return post({ type: \"error\", message: \"effect() must return an image: { width, height, data }\", stack: \"\" });\n    if (!out.data || out.data.length !== out.width * out.height * 4)\n      return post({ type: \"error\", message: \"The image's data must hold width × height × 4 values\", stack: \"\" });\n    const data = out.data instanceof Float32Array ? out.data : Float32Array.from(out.data);\n    post({ type: \"done\", image: { width: out.width, height: out.height, data } }, [data.buffer]);\n  };\n})();\n", rt = nt.split("\n").length - 1;
function it(e) {
	return nt + e;
}
function at(e) {
	let t = URL.createObjectURL(new Blob([e], { type: "text/javascript" })), n = new Worker(t);
	return URL.revokeObjectURL(t), n;
}
function ot(e, t) {
	return new Promise((n, r) => {
		if (t.signal?.aborted) return r(st());
		let i = (t.createWorker ?? at)(it(e)), a = (e) => {
			clearTimeout(s), t.signal?.removeEventListener("abort", o), i.onmessage = null, i.onerror = null, i.terminate(), e();
		}, o = () => a(() => r(st())), s = setTimeout(() => a(() => r(/* @__PURE__ */ Error(`The script took longer than ${t.timeoutMs / 1e3} s`))), t.timeoutMs);
		t.signal?.addEventListener("abort", o), i.onerror = (e) => {
			e.preventDefault(), a(() => r(Error(lt(e.lineno, e.message))));
		}, i.onmessage = ({ data: e }) => {
			let i = e;
			i.type === "progress" ? t.onProgress?.(i.value) : i.type === "log" ? t.onLog?.(i.text) : i.type === "error" ? a(() => r(Error(lt(ct(i.stack), i.message)))) : i.type === "done" && a(() => n(i.image));
		};
		let { image: c } = t;
		i.postMessage({
			image: c,
			params: t.params
		}, [c.data.buffer]);
	});
}
function st() {
	return new DOMException("The script was stopped", "AbortError");
}
function ct(e) {
	for (let t of e.matchAll(/blob:\S*?:(\d+):\d+/g)) {
		let e = Number(t[1]);
		if (e > rt) return e;
	}
	return 0;
}
function lt(e, t) {
	let n = e - rt;
	return n > 0 ? `line ${n}: ${t}` : t;
}
//#endregion
//#region src/pixels.ts
function ut(e, t, n) {
	let r = new Float32Array(e.length);
	for (let t = 0; t < e.length; t++) r[t] = e[t] / 255;
	return {
		width: t,
		height: n,
		data: r
	};
}
function dt(e) {
	let t = new Uint8ClampedArray(e.data.length);
	for (let n = 0; n < t.length; n++) {
		let r = e.data[n];
		t[n] = Number.isNaN(r) ? 0 : Math.round(r * 255);
	}
	return t;
}
async function ft(e) {
	let t = await createImageBitmap(e, {
		colorSpaceConversion: "none",
		premultiplyAlpha: "none"
	});
	try {
		let e = new OffscreenCanvas(t.width, t.height).getContext("2d", { colorSpace: "srgb" });
		if (!e) throw Error("No 2D canvas to read the image with");
		return e.drawImage(t, 0, 0), {
			width: t.width,
			height: t.height,
			data: e.getImageData(0, 0, t.width, t.height).data
		};
	} finally {
		t.close();
	}
}
async function pt(e) {
	let t = new OffscreenCanvas(e.width, e.height), n = t.getContext("2d", { colorSpace: "srgb" });
	if (!n) throw Error("No 2D canvas to write the image with");
	return n.putImageData(new ImageData(dt(e), e.width, e.height), 0, 0), t.convertToBlob({ type: "image/png" });
}
function mt(e, t, n, r) {
	return `${e.replace(/\.[^.]*$/, "") || e}-${t}${r > 1 ? `-${r}` : ""}.${n}`;
}
var ht = /already exists/i, gt = 99;
async function _t(e, t, n, r, i, a) {
	for (let o = 1; o <= gt; o++) {
		let s = mt(n, i, a, o), [c] = await e([{
			name: s,
			data: r
		}], { folder: t.folder });
		if (!c) return {
			ok: !1,
			error: "Nothing was imported"
		};
		if ("id" in c) return {
			ok: !0,
			name: s,
			id: c.id
		};
		if (!ht.test(c.error)) return {
			ok: !1,
			error: c.error
		};
	}
	return {
		ok: !1,
		error: `Every name up to ${mt(n, i, a, gt)} is in use`
	};
}
//#endregion
//#region src/settings.ts
var vt = "scriptSize", yt = "timeLimit", bt = "history", Z = 4096, xt = 16384;
function St(e) {
	let t = e.get(vt, Z);
	return typeof t == "number" && Number.isFinite(t) && t >= 0 ? Math.min(xt, Math.round(t)) : Z;
}
function Ct(e) {
	let t = e.get(yt, 120);
	return typeof t == "number" && Number.isFinite(t) ? Math.min(3600, Math.max(10, t)) : 120;
}
var wt = {
	title: "Terminal",
	keywords: [
		"console",
		"script",
		"shortcut"
	],
	fields: [{
		key: vt,
		label: "Script render size",
		hint: "Long edge in pixels of the photo a JavaScript effect gets; 0 for the original size. A float image takes 16 bytes a pixel.",
		type: "number",
		default: Z,
		min: 0,
		max: xt,
		step: 256
	}, {
		key: yt,
		label: "Script time limit",
		hint: "Seconds a JavaScript effect may take on one photo before it is stopped.",
		type: "number",
		default: 120,
		min: 10,
		max: 3600,
		step: 10
	}]
};
//#endregion
//#region src/services.ts
function Tt(e, t, n, r) {
	let i = /* @__PURE__ */ new Map(), a = (e) => `key.${e}`, o = () => e.stores.useCatalogStore.getState(), s = () => e.stores.useDevelopStore.getState(), c = () => {
		let e = s().photoId;
		return e && o().photos.find((t) => t.id === e) || null;
	}, l = () => {
		let t = c();
		if (e.stores.useUIStore.getState().activeModule === "develop") return t ? [t] : [];
		let { photos: n, selectedIds: r, activePhotoId: i } = o(), a = n.filter((e) => r.has(e.id));
		if (a.length) return a;
		let s = n.find((e) => e.id === i);
		return s ? [s] : [];
	};
	async function u(t, n) {
		let [r] = await e.export.renderPhotos([t], {
			colorSpace: "srgb",
			includeMetadata: !1,
			sharpenAmount: 0,
			pngBitDepth: 8,
			...n
		}, void 0, { processors: !1 });
		if (!r?.blob) throw Error("Safelight couldn't render the photo");
		return r.blob;
	}
	let d = () => Object.entries(s().params).filter(([, e]) => typeof e == "number" || typeof e == "boolean");
	return {
		effects: () => X(e.settings),
		saveEffects: (t) => {
			Ye(e.settings, t), r();
		},
		endpoints: () => et(e.settings),
		saveEndpoints: (t) => tt(e.settings, t),
		isLive: (e) => t.has(e),
		edit: n,
		commands: {
			has: (t) => e.commands.list().some((e) => e.name === t),
			run: (t, n, r) => Ge(e.commands, t, n, l(), r)
		},
		targets: l,
		openPhoto: c,
		displayName: (t) => e.catalog.photoDisplayName(t),
		develop: {
			keys: () => [
				...d().map(([e, t]) => ({
					key: e,
					label: e,
					kind: typeof t == "boolean" ? "boolean" : "number"
				})),
				...e.develop.adjustments.list().map((e) => ({
					key: e.key,
					label: `${e.group}: ${e.label}`,
					kind: "number"
				})),
				...e.params.list().filter((e) => e.glslType === "float" || e.glslType === "int" || e.glslType === "bool").map((e) => ({
					key: e.qualifiedKey,
					label: `${e.stageName}: ${e.label ?? e.localKey}`,
					kind: e.glslType === "bool" ? "boolean" : "number"
				}))
			],
			get: (t) => {
				let n = s();
				return Object.hasOwn(n.params, t) ? n.params[t] : e.develop.adjustments.list().some((e) => e.key === t) ? e.develop.adjustments.get(t) : n.paramBag[t] ?? e.params.get(t)?.default;
			},
			set: (t, n) => {
				let r = s();
				return Object.hasOwn(r.params, t) ? typeof r.params[t] == typeof n && (r.setParam(t, n), !0) : typeof n == "number" && e.develop.adjustments.list().some((e) => e.key === t) ? (e.develop.adjustments.set(t, n), !0) : (r.setDynParam(t, n), !0);
			},
			commit: (e) => s().commitEdit(e)
		},
		showEffectsPanel: () => {
			e.dock.isPanelOpen("terminal.effects") || e.dock.togglePanel(M, {
				direction: "right",
				width: 280
			});
		},
		renderForScript: async (t) => {
			let n = await ft(await u(t, {
				format: "image/png",
				longEdge: St(e.settings) || null
			}));
			return ut(n.data, n.width, n.height);
		},
		runScript: (e, t) => ot(e, t),
		timeLimitMs: () => Ct(e.settings) * 1e3,
		encodePng: pt,
		renderForSend: async (e, t) => {
			let n = await u(e, {
				format: t.format,
				longEdge: t.longEdge,
				quality: t.quality
			});
			return {
				bytes: new Uint8Array(await n.arrayBuffer()),
				type: t.format
			};
		},
		importBeside: (t, n, r, i) => _t(e.library.importFiles, t, e.catalog.photoDisplayName(t), n, r, i),
		network: {
			hasAccess: (t) => e.network.hasAccess(t),
			requestAccess: (t) => e.network.requestAccess(t),
			fetch: (t, n) => e.network.fetch(t, n)
		},
		keys: {
			get: async (t) => {
				let n = i.get(t);
				if (n) return n;
				try {
					return await e.secrets.get(a(t));
				} catch (e) {
					throw Error(`Couldn't read the key from the keychain: ${e instanceof Error ? e.message : String(e)}`);
				}
			},
			set: async (t, n) => await e.secrets.available().catch(() => !1) ? (await e.secrets.set(a(t), n), i.delete(t), !0) : (i.set(t, n), !1),
			delete: async (t) => {
				i.delete(t), await e.secrets.delete(a(t)).catch(() => void 0);
			}
		}
	};
}
//#endregion
//#region src/console/SuggestionList.tsx
var Et = 20;
function Dt(e) {
	let t = K.ui.tokens, n = G.useRef(null);
	G.useEffect(() => {
		n.current?.querySelector(`[data-index="${e.selected}"]`)?.scrollIntoView?.({ block: "nearest" });
	}, [e.selected]);
	let r = e.items[e.selected]?.detail;
	return /* @__PURE__ */ G.createElement("div", {
		ref: n,
		id: e.id,
		role: "listbox",
		"aria-label": "Suggestions",
		onMouseDown: (e) => e.preventDefault(),
		style: {
			position: "absolute",
			left: 8,
			[e.side === "above" ? "bottom" : "top"]: "100%",
			zIndex: 10,
			minWidth: 220,
			maxWidth: "calc(100% - 16px)",
			maxHeight: 164,
			overflowY: "auto",
			background: t.surface2,
			border: `1px solid ${t.border}`,
			borderRadius: 4,
			boxShadow: "0 4px 12px rgba(0, 0, 0, 0.35)",
			fontFamily: t.fontCode,
			fontSize: 12,
			padding: 2
		}
	}, e.items.map((n, r) => /* @__PURE__ */ G.createElement("div", {
		key: `${n.label}-${r}`,
		id: `${e.id}-${r}`,
		"data-index": r,
		role: "option",
		"aria-selected": r === e.selected,
		onClick: () => e.onPick(r),
		style: {
			display: "flex",
			gap: 12,
			alignItems: "baseline",
			height: Et,
			lineHeight: `${Et}px`,
			padding: "0 6px",
			borderRadius: 3,
			cursor: "pointer",
			whiteSpace: "nowrap",
			background: r === e.selected ? t.surface4 : "transparent",
			color: t.textPrimary
		}
	}, /* @__PURE__ */ G.createElement("span", null, n.label))), r && /* @__PURE__ */ G.createElement("div", { style: {
		borderTop: `1px solid ${t.borderSubtle}`,
		marginTop: 2,
		padding: "3px 6px",
		color: t.textMuted,
		whiteSpace: "normal"
	} }, r));
}
//#endregion
//#region src/effects/code-suggest.ts
var Q = (e) => (t) => ({
	label: t,
	insert: t,
	detail: e
}), Ot = [
	{
		label: "luma",
		insert: "luma",
		detail: "float luma(vec3 c) · Safelight"
	},
	{
		label: "srgbToLinear",
		insert: "srgbToLinear",
		detail: "vec3 srgbToLinear(vec3 c) · Safelight"
	},
	{
		label: "linearToSrgb",
		insert: "linearToSrgb",
		detail: "vec3 linearToSrgb(vec3 c), clips to 0–1 · Safelight"
	},
	{
		label: "linearToSrgbU",
		insert: "linearToSrgbU",
		detail: "vec3 linearToSrgbU(vec3 c), keeps values past 1 · Safelight"
	}
], kt = "abs acos asin atan ceil clamp cos cross degrees distance dot exp exp2 floor fract inversesqrt length log log2 max min mix mod normalize pow radians reflect round sign sin smoothstep sqrt step tan".split(" ").map(Q("GLSL")), At = "bool break const continue else false float for if int ivec2 ivec3 mat2 mat3 mat4 true vec2 vec3 vec4 while".split(" ").map(Q("GLSL")), jt = [
	{
		label: "effect",
		insert: "effect",
		detail: "function effect(image, params): the image to import"
	},
	{
		label: "image",
		insert: "image",
		detail: "{ width, height, data }: RGBA floats, 0 to 1"
	},
	{
		label: "params",
		insert: "params",
		detail: "the @param values"
	},
	{
		label: "clamp",
		insert: "clamp",
		detail: "clamp(x, lo = 0, hi = 1)"
	},
	{
		label: "lerp",
		insert: "lerp",
		detail: "lerp(a, b, t)"
	},
	{
		label: "luma",
		insert: "luma",
		detail: "luma(r, g, b)"
	},
	{
		label: "toLinear",
		insert: "toLinear",
		detail: "toLinear(v): sRGB-encoded to linear"
	},
	{
		label: "toSrgb",
		insert: "toSrgb",
		detail: "toSrgb(v): linear to sRGB-encoded"
	},
	{
		label: "createImage",
		insert: "createImage",
		detail: "createImage(width, height): opaque black"
	},
	{
		label: "progress",
		insert: "progress",
		detail: "progress(fraction): shown in the Terminal"
	},
	{
		label: "log",
		insert: "log",
		detail: "log(...values): printed in the Terminal"
	}
], Mt = "async await break const continue else false Float32Array for function if let Math new return true while".split(" ").map(Q("JavaScript")), Nt = "abs atan2 cbrt ceil cos exp floor hypot log log2 max min PI pow random round sign sin sqrt tan trunc".split(" ").map(Q("Math")), Pt = [
	{
		label: "width",
		insert: "width",
		detail: "pixels"
	},
	{
		label: "height",
		insert: "height",
		detail: "pixels"
	},
	{
		label: "data",
		insert: "data",
		detail: "Float32Array, RGBA, rows from the top"
	}
], Ft = {
	glsl: [{
		label: "@param",
		insert: "@param ",
		detail: "@param <name> <float|int|bool> [min max] <default> [label]"
	}, {
		label: "@phase",
		insert: "@phase ",
		detail: "@phase scene|display"
	}],
	js: [{
		label: "@param",
		insert: "@param ",
		detail: "@param <name> <float|int|bool> [min max] <default> [label]"
	}]
}, It = [
	"float",
	"int",
	"bool"
].map((e) => ({
	label: e,
	insert: `${e} `
})), Lt = [{
	label: "scene",
	insert: "scene",
	detail: "linear light, before the display transform"
}, {
	label: "display",
	insert: "display",
	detail: "display-encoded (the default)"
}], Rt = /[A-Za-z0-9_$]/;
function zt(e, t, n) {
	let r = e.lastIndexOf("\n", t - 1) + 1, i = e.slice(r, t), a = t;
	for (; a > r && (Rt.test(e[a - 1]) || e[a - 1] === "@");) a--;
	let o = t;
	for (; o < e.length && Rt.test(e[o]);) o++;
	let s = e.slice(a, t), l = (e) => {
		let t = s.toLowerCase(), n = e.filter((e) => e.label.toLowerCase().startsWith(t) && e.label !== s);
		return {
			from: a,
			to: o,
			items: n
		};
	};
	if (/^\s*\/\//.test(i)) return /^\s*\/\/\s*@\w*$/.test(i) ? l(Ft[n]) : n === "glsl" && /^\s*\/\/\s*@phase\s+\w*$/.test(i) ? l(Lt) : /^\s*\/\/\s*@param\s+\w+\s+\w*$/.test(i) ? l(It) : l([]);
	if (/^[0-9]/.test(s)) return l([]);
	let u = c(e, n), d = u.ok ? u.params : [];
	if (e[a - 1] === ".") {
		if (n !== "js") return l([]);
		let t = /([A-Za-z_$][\w$]*)\.$/.exec(e.slice(r, a))?.[1];
		return l(t === "params" ? d.map(Vt) : t === "image" ? Pt : t === "Math" ? Nt : []);
	}
	if (!s) return l([]);
	let f = n === "glsl" ? /\b(?:float|int|bool|vec[234]|ivec[234]|mat[234])\s+([A-Za-z_]\w*)/g : /\b(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)/g, p = [...new Set([...e.matchAll(f)].map((e) => e[1]))].map(Q("declared here")), m = [...d.map(Vt), ...p], h = n === "glsl" ? [
		{
			label: "c",
			insert: "c",
			detail: "vec3, the colour"
		},
		...Ot,
		...kt,
		...At
	] : [...jt, ...Mt], g = /* @__PURE__ */ new Set();
	return l([...m, ...h].filter((e) => !g.has(e.label) && !!g.add(e.label)));
}
function Bt(e, t, n) {
	return {
		text: e.slice(0, t.from) + n.insert + e.slice(t.to),
		cursor: t.from + n.insert.length
	};
}
function Vt(e) {
	let t = e.type !== "bool" && e.min !== void 0 && e.max !== void 0 ? `, ${e.min} to ${e.max}` : "";
	return {
		label: e.key,
		insert: e.key,
		detail: `${e.type} param${t}`
	};
}
//#endregion
//#region src/EffectEditor.tsx
function Ht(e, t) {
	let n = c(e.source, e.kind);
	if (!n.ok) return {
		errors: n.errors,
		warnings: []
	};
	if (e.kind !== "glsl") return {
		errors: [],
		warnings: []
	};
	let r = de(e.source);
	return r.length ? {
		errors: r,
		warnings: []
	} : t ? me(ue(e, n), t) : {
		errors: [],
		warnings: [{
			line: 0,
			message: "Not compiled ahead: no WebGL2 here. Develop reports any error."
		}]
	};
}
var Ut = (e) => e.line ? `line ${e.line}: ${e.message}` : e.message;
function Wt(e) {
	let { Button: t, TextArea: n, Row: r } = K.ui, i = K.ui.tokens, [a, o] = G.useState(e.record.source), [s, c] = G.useState(null), [l, u] = G.useState(0), [d, f] = G.useState(!1), [p, m] = G.useState(0), h = G.useRef(null), g = G.useRef(null), _ = k[e.record.kind], v = e.record.kind === "gmic" ? null : e.record.kind, y = G.useMemo(() => d && v ? zt(a, l, v) : null, [
		d,
		v,
		a,
		l
	]), b = y?.items ?? [], x = b.length > 0;
	G.useLayoutEffect(() => {
		g.current !== null && h.current && (h.current.setSelectionRange(g.current, g.current), g.current = null);
	});
	let S = (e) => {
		if (!y || !b[e]) return;
		let t = Bt(a, y, b[e]);
		g.current = t.cursor, o(t.text), u(t.cursor), m(0), f(t.text.slice(0, t.cursor).endsWith(" ") && /@\w+ $/.test(t.text.slice(0, t.cursor)));
	}, C = (e) => {
		h.current = e.currentTarget;
		let t = e.ctrlKey || e.metaKey;
		if (t && e.key.toLowerCase() === "s") e.preventDefault(), w();
		else if (t && e.key === " ") e.preventDefault(), u(e.currentTarget.selectionStart), m(0), f(!0);
		else if (x && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
			e.preventDefault();
			let t = e.key === "ArrowDown" ? 1 : -1;
			m((e) => (e + t + b.length) % b.length);
		} else x && e.key === "Tab" && !e.shiftKey ? (e.preventDefault(), S(p)) : x && e.key === "Escape" ? (e.preventDefault(), e.stopPropagation(), f(!1)) : (e.key === "Enter" || e.key === "ArrowLeft" || e.key === "ArrowRight") && f(!1);
	}, w = () => {
		let t = {
			...e.record,
			source: a
		}, n = Ht(t, e.compile);
		c(n), n.errors.length || e.onSave(t);
	};
	return /* @__PURE__ */ G.createElement("div", { style: {
		display: "flex",
		flexDirection: "column",
		height: "100%",
		gap: 6,
		padding: 6,
		boxSizing: "border-box"
	} }, /* @__PURE__ */ G.createElement(r, { gap: 6 }, /* @__PURE__ */ G.createElement("span", { style: {
		color: i.textPrimary,
		fontSize: 12,
		flex: 1
	} }, e.record.name, " ", /* @__PURE__ */ G.createElement("span", { style: { color: i.textMuted } }, "· ", _.label, _.live ? " · live" : " · run")), /* @__PURE__ */ G.createElement(t, {
		size: "sm",
		variant: "primary",
		onClick: w
	}, "Save"), /* @__PURE__ */ G.createElement(t, {
		size: "sm",
		variant: "ghost",
		onClick: e.onClose
	}, e.isNew ? "Discard" : "Close")), /* @__PURE__ */ G.createElement("div", { style: {
		position: "relative",
		flex: 1,
		minHeight: 80,
		display: "flex"
	} }, /* @__PURE__ */ G.createElement(n, {
		mono: !0,
		"aria-label": `${e.record.name} source`,
		role: "combobox",
		"aria-expanded": x,
		"aria-controls": x ? "terminal-code-suggestions" : void 0,
		"aria-activedescendant": x ? `terminal-code-suggestions-${p}` : void 0,
		"aria-autocomplete": "list",
		spellCheck: !1,
		value: a,
		onChange: (e) => {
			o(e), m(0), f(!0);
		},
		onInput: (e) => {
			h.current = e.currentTarget, u(e.currentTarget.selectionStart);
		},
		onSelect: (e) => {
			h.current = e.currentTarget, u(e.currentTarget.selectionStart);
		},
		onMouseDown: () => f(!1),
		onBlur: () => f(!1),
		onKeyDown: C,
		style: {
			flex: 1,
			resize: "none",
			fontFamily: i.fontCode,
			fontSize: 12
		}
	}), x && /* @__PURE__ */ G.createElement(Dt, {
		id: "terminal-code-suggestions",
		items: b,
		selected: p,
		side: "above",
		onPick: S
	})), s && (s.errors.length > 0 || s.warnings.length > 0) && /* @__PURE__ */ G.createElement("div", {
		role: "status",
		style: {
			fontFamily: i.fontCode,
			fontSize: 11,
			maxHeight: 80,
			overflow: "auto"
		}
	}, s.errors.map((e, t) => /* @__PURE__ */ G.createElement("div", {
		key: `e${t}`,
		style: { color: i.labelRed }
	}, Ut(e))), s.warnings.map((e, t) => /* @__PURE__ */ G.createElement("div", {
		key: `w${t}`,
		style: { color: i.textMuted }
	}, Ut(e)))));
}
//#endregion
//#region src/EndpointEditor.tsx
function Gt(e) {
	let t = {}, n = e.split(/\r?\n/);
	for (let e = 0; e < n.length; e++) {
		let r = n[e];
		if (!r.trim()) continue;
		let i = r.indexOf(":"), a = i > 0 ? r.slice(0, i).trim() : "";
		if (!a) return {
			ok: !1,
			error: `Line ${e + 1}: write name: value`
		};
		t[a] = r.slice(i + 1).trim();
	}
	return {
		ok: !0,
		pairs: t
	};
}
function Kt(e) {
	return Object.entries(e).map(([e, t]) => `${e}: ${t}`).join("\n");
}
var qt = [
	{
		value: "multipart",
		label: "Form upload (multipart)"
	},
	{
		value: "body",
		label: "Image as the whole body"
	},
	{
		value: "json-base64",
		label: "JSON, image as base64"
	},
	{
		value: "json-data-url",
		label: "JSON, image as a data URL"
	}
], Jt = [{
	value: "image",
	label: "An image"
}, {
	value: "json",
	label: "JSON with the image in it"
}], Yt = [{
	value: "image/jpeg",
	label: "JPEG"
}, {
	value: "image/png",
	label: "PNG"
}];
function Xt(e) {
	let { Button: t, TextInput: n, NumberInput: r, TextArea: i, Select: a, Field: o, Toggle: s, Row: c, Stack: l } = K.ui, u = K.ui.tokens, [d, f] = G.useState(e.record), [p, h] = G.useState(Kt(e.record.fields)), [g, _] = G.useState(Kt(e.record.headers)), [v, y] = G.useState([]), [b, x] = G.useState(!1), S = (e) => f((t) => ({
		...t,
		...e
	})), C = async () => {
		let t = Gt(p), n = Gt(g), r = {
			...d,
			url: d.url.trim(),
			fields: t.ok ? t.pairs : {},
			headers: n.ok ? n.pairs : {}
		}, i = [
			...t.ok ? [] : [`Fields: ${t.error}`],
			...n.ok ? [] : [`Headers: ${n.error}`],
			...m(r)
		];
		if (y(i), !i.length) {
			x(!0);
			try {
				await e.onSave(r);
			} catch (e) {
				y([e instanceof Error ? e.message : String(e)]);
			} finally {
				x(!1);
			}
		}
	}, w = {
		fontFamily: u.fontCode,
		fontSize: 12
	};
	return /* @__PURE__ */ G.createElement("div", { style: {
		height: "100%",
		overflow: "auto",
		padding: 8,
		boxSizing: "border-box"
	} }, /* @__PURE__ */ G.createElement(l, { gap: 8 }, /* @__PURE__ */ G.createElement(c, { gap: 6 }, /* @__PURE__ */ G.createElement("span", { style: {
		color: u.textPrimary,
		fontSize: 12,
		flex: 1
	} }, d.name), /* @__PURE__ */ G.createElement(t, {
		size: "sm",
		variant: "primary",
		disabled: b,
		onClick: () => void C()
	}, "Save"), /* @__PURE__ */ G.createElement(t, {
		size: "sm",
		variant: "ghost",
		onClick: e.onClose
	}, e.isNew ? "Discard" : "Close")), /* @__PURE__ */ G.createElement(o, {
		label: "Address",
		hint: "{{name}} is filled from name=value when you send; {{filename}} is the photo's name."
	}, /* @__PURE__ */ G.createElement(c, { gap: 6 }, /* @__PURE__ */ G.createElement("div", { style: { width: 90 } }, /* @__PURE__ */ G.createElement(a, {
		ariaLabel: "Method",
		value: d.method,
		onChange: (e) => S({ method: e === "PUT" ? "PUT" : "POST" }),
		options: [{
			value: "POST",
			label: "POST"
		}, {
			value: "PUT",
			label: "PUT"
		}]
	})), /* @__PURE__ */ G.createElement("div", { style: { flex: 1 } }, /* @__PURE__ */ G.createElement(n, {
		"aria-label": "Address",
		spellCheck: !1,
		style: w,
		value: d.url,
		onChange: (e) => S({ url: e })
	})))), /* @__PURE__ */ G.createElement(o, { label: "Send the photo as" }, /* @__PURE__ */ G.createElement(a, {
		ariaLabel: "Send the photo as",
		value: d.send,
		onChange: (e) => S({ send: e }),
		options: qt
	})), d.send !== "body" && /* @__PURE__ */ G.createElement(o, {
		label: d.send === "multipart" ? "Image field" : "Image key",
		hint: d.send === "multipart" ? void 0 : "Dots nest: input.image"
	}, /* @__PURE__ */ G.createElement(n, {
		"aria-label": "Image field",
		spellCheck: !1,
		style: w,
		value: d.field,
		onChange: (e) => S({ field: e })
	})), /* @__PURE__ */ G.createElement(c, { gap: 8 }, /* @__PURE__ */ G.createElement(o, { label: "Format" }, /* @__PURE__ */ G.createElement(a, {
		ariaLabel: "Format",
		value: d.format,
		onChange: (e) => S({ format: e }),
		options: Yt
	})), /* @__PURE__ */ G.createElement(o, {
		label: "Long edge (px)",
		hint: "0 for the original size"
	}, /* @__PURE__ */ G.createElement(r, {
		"aria-label": "Long edge",
		min: 0,
		max: 16384,
		step: 256,
		value: d.longEdge ?? 0,
		onChange: (e) => S({ longEdge: e > 0 ? e : null })
	})), d.format === "image/jpeg" && /* @__PURE__ */ G.createElement(o, { label: "Quality" }, /* @__PURE__ */ G.createElement(r, {
		"aria-label": "Quality",
		min: .1,
		max: 1,
		step: .01,
		value: d.quality,
		onChange: (e) => S({ quality: e })
	}))), /* @__PURE__ */ G.createElement(o, {
		label: d.send === "multipart" ? "Other form fields" : d.send === "body" ? "Other fields (unused)" : "Other JSON keys",
		hint: "One name: value a line."
	}, /* @__PURE__ */ G.createElement(i, {
		mono: !0,
		"aria-label": "Other fields",
		rows: 3,
		value: p,
		onChange: h
	})), /* @__PURE__ */ G.createElement(o, { label: "Key" }, /* @__PURE__ */ G.createElement(l, { gap: 6 }, /* @__PURE__ */ G.createElement(s, {
		label: "Send a key",
		checked: d.auth !== null,
		onChange: (e) => S({ auth: e ? {
			header: "Authorization",
			prefix: "Bearer "
		} : null })
	}), d.auth && /* @__PURE__ */ G.createElement(c, { gap: 6 }, /* @__PURE__ */ G.createElement(n, {
		"aria-label": "Key header",
		spellCheck: !1,
		style: w,
		value: d.auth.header,
		onChange: (e) => S({ auth: {
			...d.auth,
			header: e
		} })
	}), /* @__PURE__ */ G.createElement(n, {
		"aria-label": "Key prefix",
		spellCheck: !1,
		style: w,
		value: d.auth.prefix,
		onChange: (e) => S({ auth: {
			...d.auth,
			prefix: e
		} })
	})), d.auth && /* @__PURE__ */ G.createElement("span", { style: {
		color: u.textMuted,
		fontSize: 11
	} }, "Set the key itself with: api key ", d.slug))), /* @__PURE__ */ G.createElement(o, {
		label: "Other headers",
		hint: "One name: value a line."
	}, /* @__PURE__ */ G.createElement(i, {
		mono: !0,
		"aria-label": "Other headers",
		rows: 2,
		value: g,
		onChange: _
	})), /* @__PURE__ */ G.createElement(o, { label: "The answer is" }, /* @__PURE__ */ G.createElement(a, {
		ariaLabel: "The answer is",
		value: d.reply,
		onChange: (e) => S({ reply: e }),
		options: Jt
	})), d.reply === "json" && /* @__PURE__ */ G.createElement(o, {
		label: "Image in the JSON",
		hint: "Dot path to base64, a data URL or an image address: output.0.url"
	}, /* @__PURE__ */ G.createElement(n, {
		"aria-label": "Image path",
		spellCheck: !1,
		style: w,
		value: d.path,
		onChange: (e) => S({ path: e })
	})), v.length > 0 && /* @__PURE__ */ G.createElement("div", {
		role: "status",
		style: {
			color: u.labelRed,
			fontSize: 11
		}
	}, v.map((e) => /* @__PURE__ */ G.createElement("div", { key: e }, e)))));
}
//#endregion
//#region src/TerminalPanel.tsx
function Zt(e) {
	return function() {
		let t = G.useSyncExternalStore(e.editing.subscribe, e.editing.get), n = () => e.editing.set(null);
		return t?.kind === "effect" ? /* @__PURE__ */ G.createElement(Wt, {
			key: t.record.slug,
			record: t.record,
			isNew: t.isNew,
			compile: e.compile(),
			onSave: (r) => {
				e.saveEffect(r, t.isNew), n();
			},
			onClose: n
		}) : t?.kind === "endpoint" ? /* @__PURE__ */ G.createElement(Xt, {
			key: t.record.slug,
			record: t.record,
			isNew: t.isNew,
			onSave: async (r) => {
				await e.saveEndpoint(r, t.isNew), n();
			},
			onClose: n
		}) : /* @__PURE__ */ G.createElement(Qt, { deps: e });
	};
}
function Qt({ deps: e }) {
	let { terminal: t } = e, n = G.useSyncExternalStore(t.subscribe, t.getSnapshot), r = G.useSyncExternalStore(e.focus.subscribe, e.focus.get), [i, a] = G.useState(""), [o, s] = G.useState(0), [c, l] = G.useState(!1), [u, d] = G.useState(0), f = G.useRef(null), p = G.useRef(null), m = G.useRef(null), h = K.ui.tokens, g = G.useMemo(() => c && !n.prompt ? e.suggest(i, o) : null, [
		c,
		n.prompt,
		i,
		o
	]), _ = g?.items ?? [], v = _.length > 0;
	G.useEffect(() => {
		f.current?.focus();
	}, [r]), G.useLayoutEffect(() => {
		let e = p.current;
		e && (e.scrollTop = e.scrollHeight);
	}, [n.lines]), G.useLayoutEffect(() => {
		m.current !== null && f.current && (f.current.setSelectionRange(m.current, m.current), m.current = null);
	});
	let y = (e, t, n) => {
		a(e), s(t), d(0), l(n);
	}, b = (e) => {
		if (!g || !_[e]) return;
		let t = Oe(i, g, _[e]);
		m.current = t.cursor, y(t.text, t.cursor, !0);
	}, x = {
		input: h.textSecondary,
		output: h.textPrimary,
		error: h.labelRed,
		info: h.textMuted
	}, S = (r) => {
		let a = r.ctrlKey || r.metaKey;
		if (v && (r.key === "ArrowDown" || r.key === "ArrowUp")) {
			r.preventDefault();
			let e = r.key === "ArrowDown" ? 1 : -1;
			d((t) => (t + e + _.length) % _.length);
		} else if (v && r.key === "Escape") r.preventDefault(), r.stopPropagation(), l(!1);
		else if (r.key === "Tab" && !r.shiftKey) {
			if (r.preventDefault(), n.prompt) return;
			if (v) b(u);
			else {
				let t = r.currentTarget.selectionStart ?? i.length, n = e.suggest(i, t);
				if (n.items.length === 1) {
					let e = Oe(i, n, n.items[0]);
					m.current = e.cursor, y(e.text, e.cursor, !0);
				} else s(t), d(0), l(!0);
			}
		} else if (r.key === "Enter") {
			r.preventDefault();
			let e = i;
			y("", 0, !1), t.submit(e);
		} else if (r.key === "ArrowUp" || r.key === "ArrowDown") {
			if (n.prompt) return;
			r.preventDefault();
			let e = t.historyStep(r.key === "ArrowUp" ? -1 : 1, i);
			m.current = e.length, y(e, e.length, !1);
		} else if (a && !r.shiftKey && !r.altKey && r.key === " ") r.preventDefault(), s(r.currentTarget.selectionStart ?? i.length), l(!0);
		else if (a && !r.shiftKey && !r.altKey && r.key.toLowerCase() === "l") r.preventDefault(), t.clear();
		else if (a && !r.shiftKey && !r.altKey && r.key.toLowerCase() === "c") {
			let e = r.currentTarget;
			if (e.selectionStart !== e.selectionEnd || window.getSelection()?.toString()) return;
			r.preventDefault(), n.busy || n.prompt ? t.cancel() : i && (t.write("input", `${i}^C`), y("", 0, !1));
		}
	}, C = "terminal-suggestions";
	return /* @__PURE__ */ G.createElement("div", {
		style: {
			display: "flex",
			flexDirection: "column",
			height: "100%",
			background: h.surface0,
			fontFamily: h.fontCode,
			fontSize: 12
		},
		onMouseUp: () => {
			window.getSelection()?.toString() || f.current?.focus();
		}
	}, /* @__PURE__ */ G.createElement("div", {
		ref: p,
		role: "log",
		"aria-live": "polite",
		style: {
			flex: 1,
			overflow: "auto",
			padding: "4px 8px",
			userSelect: "text"
		}
	}, n.lines.length === 0 && /* @__PURE__ */ G.createElement("div", { style: { color: h.textMuted } }, "Terminal. Type help for the commands; Tab takes a suggestion."), n.lines.map((e) => /* @__PURE__ */ G.createElement("div", {
		key: e.id,
		style: {
			color: x[e.kind],
			whiteSpace: "pre-wrap",
			wordBreak: "break-word",
			minHeight: "1.4em"
		}
	}, e.kind === "input" ? `› ${e.text}` : e.text))), /* @__PURE__ */ G.createElement("label", { style: {
		position: "relative",
		display: "flex",
		alignItems: "center",
		gap: 6,
		padding: "3px 8px",
		borderTop: `1px solid ${h.borderSubtle}`
	} }, v && /* @__PURE__ */ G.createElement(Dt, {
		id: C,
		items: _,
		selected: u,
		side: "above",
		onPick: b
	}), /* @__PURE__ */ G.createElement("span", { style: { color: n.busy && !n.prompt ? h.textMuted : h.accent } }, n.prompt ? n.prompt.label : "›"), /* @__PURE__ */ G.createElement("input", {
		ref: f,
		"aria-label": n.prompt ? n.prompt.label : "Command",
		role: "combobox",
		"aria-expanded": v,
		"aria-controls": v ? C : void 0,
		"aria-activedescendant": v ? `${C}-${u}` : void 0,
		"aria-autocomplete": "list",
		type: n.prompt ? "password" : "text",
		autoComplete: "off",
		spellCheck: !1,
		value: i,
		placeholder: n.busy && !n.prompt ? "Running… Ctrl+C stops it" : "",
		onChange: (e) => y(e.target.value, e.target.selectionStart ?? e.target.value.length, e.target.value.trim() !== ""),
		onSelect: (e) => s(e.currentTarget.selectionStart ?? i.length),
		onBlur: () => l(!1),
		onKeyDown: S,
		style: {
			flex: 1,
			minWidth: 0,
			background: "transparent",
			border: "none",
			outline: "none",
			color: h.textPrimary,
			font: "inherit",
			padding: "2px 0"
		}
	})));
}
//#endregion
//#region src/index.tsx
var $t = {
	direction: "bottom",
	height: 240
}, $ = null;
function en(e, t = nn()) {
	He(e);
	let n = new H(null), r = new H(0), i = new H([]), a = new Be({
		register: (t) => e.registerProcessingStage(t),
		unregister: (t) => e.unregisterProcessingStage(t)
	}), o = [], s = (e) => void o.push(e), c = /* @__PURE__ */ new Set(), l = () => {
		let t = X(e.settings), n = a.sync(t);
		for (let e of n) c.has(e) || s(e);
		c = new Set(n), i.set(t);
	}, u = Tt(e, a, (e) => n.set(e), l), d = e.settings.get(bt, []), f = ye(u), p = [
		...Object.keys(f),
		"help",
		"clear"
	], m = () => ({
		...Ke(e.commands, u.targets, p),
		...f
	}), h = new Ce(m, {
		history: Array.isArray(d) ? d.filter((e) => typeof e == "string") : [],
		saveHistory: (t) => e.settings.set(bt, t)
	});
	s = (e) => h.write("error", e), l();
	for (let e of o) s(e);
	return $?.(), $ = e.settings.onChange((e) => {
		e === "effects" && l();
	}), e.registerPanel({
		id: j,
		title: "Terminal",
		component: Zt({
			terminal: h,
			editing: n,
			focus: r,
			compile: t,
			saveEffect: (t, n) => {
				let r = X(e.settings);
				Ye(e.settings, n ? [...r, t] : r.map((e) => e.slug === t.slug ? t : e)), l();
				let i = n ? t.kind === "glsl" ? ` Turn it on with: fx apply ${t.slug}` : ` Run it with: run ${t.slug}` : "";
				h.write("info", `Saved ${t.name}.${i}`);
			},
			saveEndpoint: async (t, n) => {
				let r = new URL(t.url).origin;
				if (!r.includes("{{") && !await e.network.requestAccess(t.url)) throw Error(`Safelight isn't allowed to reach ${r}; the endpoint wasn't saved.`);
				let i = et(e.settings);
				tt(e.settings, n ? [...i, t] : i.map((e) => e.slug === t.slug ? t : e)), h.write("info", `Saved ${t.name}.${t.auth ? ` Set its key with: api key ${t.slug}` : ""}`);
			},
			suggest: (e, t) => De(e, t, {
				commands: m,
				effects: u.effects,
				endpoints: u.endpoints,
				developKeys: u.develop.keys
			})
		}),
		allowBottomDock: !0,
		fill: !0
	}), e.registerPanel({
		id: M,
		title: "Script Effects",
		component: Ue(i, (e) => a.has(e))
	}), e.registerKeybinding({
		id: ce,
		label: "Toggle Terminal",
		category: "General",
		defaultCombo: le,
		handler: () => {
			e.dock.togglePanel(j, $t), e.dock.isPanelOpen("terminal.panel") && r.set(r.get() + 1);
		}
	}), e.registerSettings(wt), {
		terminal: h,
		editing: n,
		effects: i,
		live: a,
		focus: r
	};
}
function tn() {
	$?.(), $ = null;
}
function nn() {
	let e;
	return () => {
		if (e === void 0) try {
			e = he();
		} catch {
			e = null;
		}
		return e;
	};
}
//#endregion
export { M as EFFECTS_PANEL_ID, j as PANEL_ID, $t as TERMINAL_PLACEMENT, ce as TOGGLE_ACTION, en as activate, tn as deactivate };

//# sourceMappingURL=index.js.map