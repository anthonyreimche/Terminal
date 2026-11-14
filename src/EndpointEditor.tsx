// Setting up an endpoint. Save checks it, asks for access to its address, and
// keeps it.

import { validateEndpoint, type Endpoint, type ReplyAs, type SendAs, type SendFormat } from "./endpoints/endpoint";
import { React, api } from "./rt";

/** "name: value" lines to a map; a line without a colon or a name is an error. */
export function parsePairs(text: string): { ok: true; pairs: Record<string, string> } | { ok: false; error: string } {
  const pairs: Record<string, string> = {};
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const at = line.indexOf(":");
    const name = at > 0 ? line.slice(0, at).trim() : "";
    if (!name) return { ok: false, error: `Line ${i + 1}: write name: value` };
    pairs[name] = line.slice(at + 1).trim();
  }
  return { ok: true, pairs };
}

export function formatPairs(pairs: Readonly<Record<string, string>>): string {
  return Object.entries(pairs)
    .map(([name, value]) => `${name}: ${value}`)
    .join("\n");
}

const SEND_OPTIONS: { value: SendAs; label: string }[] = [
  { value: "multipart", label: "Form upload (multipart)" },
  { value: "body", label: "Image as the whole body" },
  { value: "json-base64", label: "JSON, image as base64" },
  { value: "json-data-url", label: "JSON, image as a data URL" },
];

const REPLY_OPTIONS: { value: ReplyAs; label: string }[] = [
  { value: "image", label: "An image" },
  { value: "json", label: "JSON with the image in it" },
];

const FORMAT_OPTIONS: { value: SendFormat; label: string }[] = [
  { value: "image/jpeg", label: "JPEG" },
  { value: "image/png", label: "PNG" },
];

export function EndpointEditor(props: {
  record: Endpoint;
  isNew: boolean;
  onSave(record: Endpoint): Promise<void>;
  onClose(): void;
}) {
  const { Button, TextInput, NumberInput, TextArea, Select, Field, Toggle, Row, Stack } = api.ui;
  const t = api.ui.tokens;
  const [ep, setEp] = React.useState(props.record);
  const [fields, setFields] = React.useState(formatPairs(props.record.fields));
  const [headers, setHeaders] = React.useState(formatPairs(props.record.headers));
  const [errors, setErrors] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);
  const patch = (p: Partial<Endpoint>) => setEp((e) => ({ ...e, ...p }));

  const save = async () => {
    const f = parsePairs(fields);
    const h = parsePairs(headers);
    const next = { ...ep, url: ep.url.trim(), fields: f.ok ? f.pairs : {}, headers: h.ok ? h.pairs : {} };
    const problems = [...(f.ok ? [] : [`Fields: ${f.error}`]), ...(h.ok ? [] : [`Headers: ${h.error}`]), ...validateEndpoint(next)];
    setErrors(problems);
    if (problems.length) return;
    setSaving(true);
    try {
      await props.onSave(next);
    } catch (e) {
      setErrors([e instanceof Error ? e.message : String(e)]);
    } finally {
      setSaving(false);
    }
  };

  const mono = { fontFamily: t.fontCode, fontSize: 12 };
  return (
    <div style={{ height: "100%", overflow: "auto", padding: 8, boxSizing: "border-box" }}>
      <Stack gap={8}>
        <Row gap={6}>
          <span style={{ color: t.textPrimary, fontSize: 12, flex: 1 }}>{ep.name}</span>
          <Button size="sm" variant="primary" disabled={saving} onClick={() => void save()}>
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={props.onClose}>
            {props.isNew ? "Discard" : "Close"}
          </Button>
        </Row>
        <Field label="Address" hint="{{name}} is filled from name=value when you send; {{filename}} is the photo's name.">
          <Row gap={6}>
            <div style={{ width: 90 }}>
              <Select
                ariaLabel="Method"
                value={ep.method}
                onChange={(v) => patch({ method: v === "PUT" ? "PUT" : "POST" })}
                options={[
                  { value: "POST", label: "POST" },
                  { value: "PUT", label: "PUT" },
                ]}
              />
            </div>
            <div style={{ flex: 1 }}>
              <TextInput aria-label="Address" spellCheck={false} style={mono} value={ep.url} onChange={(url) => patch({ url })} />
            </div>
          </Row>
        </Field>
        <Field label="Send the photo as">
          <Select ariaLabel="Send the photo as" value={ep.send} onChange={(v) => patch({ send: v as SendAs })} options={SEND_OPTIONS} />
        </Field>
        {ep.send !== "body" && (
          <Field label={ep.send === "multipart" ? "Image field" : "Image key"} hint={ep.send === "multipart" ? undefined : "Dots nest: input.image"}>
            <TextInput aria-label="Image field" spellCheck={false} style={mono} value={ep.field} onChange={(field) => patch({ field })} />
          </Field>
        )}
        <Row gap={8}>
          <Field label="Format">
            <Select ariaLabel="Format" value={ep.format} onChange={(v) => patch({ format: v as SendFormat })} options={FORMAT_OPTIONS} />
          </Field>
          <Field label="Long edge (px)" hint="0 for the original size">
            <NumberInput aria-label="Long edge" min={0} max={16384} step={256} value={ep.longEdge ?? 0} onChange={(v) => patch({ longEdge: v > 0 ? v : null })} />
          </Field>
          {ep.format === "image/jpeg" && (
            <Field label="Quality">
              <NumberInput aria-label="Quality" min={0.1} max={1} step={0.01} value={ep.quality} onChange={(quality) => patch({ quality })} />
            </Field>
          )}
        </Row>
        <Field label={ep.send === "multipart" ? "Other form fields" : ep.send === "body" ? "Other fields (unused)" : "Other JSON keys"} hint="One name: value a line.">
          <TextArea mono aria-label="Other fields" rows={3} value={fields} onChange={setFields} />
        </Field>
        <Field label="Key">
          <Stack gap={6}>
            <Toggle
              label="Send a key"
              checked={ep.auth !== null}
              onChange={(on) => patch({ auth: on ? { header: "Authorization", prefix: "Bearer " } : null })}
            />
            {ep.auth && (
              <Row gap={6}>
                <TextInput aria-label="Key header" spellCheck={false} style={mono} value={ep.auth.header} onChange={(header) => patch({ auth: { ...ep.auth!, header } })} />
                <TextInput aria-label="Key prefix" spellCheck={false} style={mono} value={ep.auth.prefix} onChange={(prefix) => patch({ auth: { ...ep.auth!, prefix } })} />
              </Row>
            )}
            {ep.auth && <span style={{ color: t.textMuted, fontSize: 11 }}>Set the key itself with: api key {ep.slug}</span>}
          </Stack>
        </Field>
        <Field label="Other headers" hint="One name: value a line.">
          <TextArea mono aria-label="Other headers" rows={2} value={headers} onChange={setHeaders} />
        </Field>
        <Field label="The answer is">
          <Select ariaLabel="The answer is" value={ep.reply} onChange={(v) => patch({ reply: v as ReplyAs })} options={REPLY_OPTIONS} />
        </Field>
        {ep.reply === "json" && (
          <Field label="Image in the JSON" hint="Dot path to base64, a data URL or an image address: output.0.url">
            <TextInput aria-label="Image path" spellCheck={false} style={mono} value={ep.path} onChange={(path) => patch({ path })} />
          </Field>
        )}
        {errors.length > 0 && (
          <div role="status" style={{ color: t.labelRed, fontSize: 11 }}>
            {errors.map((e) => (
              <div key={e}>{e}</div>
            ))}
          </div>
        )}
      </Stack>
    </div>
  );
}
