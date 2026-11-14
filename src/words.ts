// Command lines split as a shell splits them: whitespace between words, single
// quotes literal, double quotes and bare text honouring a backslash escape.

export function tokenize(line: string): string[] {
  const words: string[] = [];
  let word = "";
  let inWord = false;
  let quote: "'" | '"' | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote === "'") {
      if (ch === "'") quote = null;
      else word += ch;
      continue;
    }
    if (ch === "\\" && i + 1 < line.length) {
      word += line[++i];
      inWord = true;
      continue;
    }
    if (quote === '"') {
      if (ch === '"') quote = null;
      else word += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      inWord = true;
    } else if (/\s/.test(ch)) {
      if (inWord) words.push(word);
      word = "";
      inWord = false;
    } else {
      word += ch;
      inWord = true;
    }
  }
  if (quote) throw new Error(`Unclosed ${quote} quote`);
  if (inWord) words.push(word);
  return words;
}

export interface Args {
  positional: string[];
  named: Record<string, string>;
  flags: string[];
}

const NAMED = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s;
const FLAG = /^--([A-Za-z][A-Za-z0-9-]*)$/;

export function parseArgs(words: readonly string[]): Args {
  const args: Args = { positional: [], named: {}, flags: [] };
  for (const word of words) {
    const named = NAMED.exec(word);
    const flag = FLAG.exec(word);
    if (named) args.named[named[1]] = named[2];
    else if (flag) args.flags.push(flag[1]);
    else args.positional.push(word);
  }
  return args;
}
