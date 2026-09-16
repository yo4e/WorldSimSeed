import { WorldSimError } from "../errors.js";

interface Line {
  indent: number;
  text: string;
  line: number;
}

const forbiddenScalarPrefixes = ["&", "*", "!", "|", ">"];

export function parseRestrictedYaml(source: string): unknown {
  const lines = preprocess(source);
  if (lines.length === 0) {
    throw new WorldSimError("PARSE_ERROR", "YAML input is empty.");
  }

  const [value, next] = parseBlock(lines, 0, lines[0]!.indent);
  if (next !== lines.length) {
    const line = lines[next]!;
    throw new WorldSimError(
      "PARSE_ERROR",
      `Unexpected YAML content at line ${line.line}.`,
    );
  }
  return value;
}

function preprocess(source: string): Line[] {
  const out: Line[] = [];

  for (const [index, raw] of source.split(/\r?\n/).entries()) {
    if (raw.includes("\t")) {
      throw new WorldSimError(
        "PARSE_ERROR",
        `Tabs are not allowed in YAML indentation (line ${index + 1}).`,
      );
    }

    const withoutComment = stripComment(raw).replace(/\s+$/, "");
    if (withoutComment.trim() === "") continue;

    const indent = withoutComment.length - withoutComment.trimStart().length;
    if (indent % 2 !== 0) {
      throw new WorldSimError(
        "PARSE_ERROR",
        `YAML indentation must use multiples of two spaces (line ${index + 1}).`,
      );
    }

    out.push({
      indent,
      text: withoutComment.slice(indent),
      line: index + 1,
    });
  }

  return out;
}

function stripComment(line: string): string {
  let quote: "'" | '"' | null = null;
  let escaped = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]!;

    if (quote === '"') {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') quote = null;
      continue;
    }

    if (quote === "'") {
      if (char === "'") {
        if (line[i + 1] === "'") {
          i += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === "#") {
      return line.slice(0, i);
    }
  }

  return line;
}

function parseBlock(
  lines: Line[],
  start: number,
  indent: number,
): [unknown, number] {
  const current = lines[start];
  if (!current || current.indent !== indent) {
    throw new WorldSimError("PARSE_ERROR", "Invalid YAML indentation.");
  }

  if (isSequenceLine(current.text)) {
    return parseSequence(lines, start, indent);
  }

  return parseMapping(lines, start, indent);
}

function parseMapping(
  lines: Line[],
  start: number,
  indent: number,
  initial?: Record<string, unknown>,
): [Record<string, unknown>, number] {
  const object = initial ?? Object.create(null);
  let index = start;

  while (index < lines.length) {
    const line = lines[index]!;

    if (line.indent < indent) break;
    if (line.indent > indent) {
      throw new WorldSimError(
        "PARSE_ERROR",
        `Unexpected indentation at line ${line.line}.`,
      );
    }
    if (isSequenceLine(line.text)) break;

    const { key, rest } = splitKeyValue(line.text, line.line);
    assertSafeYamlKey(key, line.line);
    index += 1;

    if (rest === "") {
      const next = lines[index];
      if (next && next.indent > indent) {
        const [child, nextIndex] = parseBlock(lines, index, next.indent);
        object[key] = child;
        index = nextIndex;
      } else {
        object[key] = null;
      }
    } else {
      object[key] = parseScalar(rest, line.line);
    }
  }

  return [object, index];
}

function parseSequence(
  lines: Line[],
  start: number,
  indent: number,
): [unknown[], number] {
  const array: unknown[] = [];
  let index = start;

  while (index < lines.length) {
    const line = lines[index]!;

    if (line.indent < indent) break;
    if (line.indent > indent) {
      throw new WorldSimError(
        "PARSE_ERROR",
        `Unexpected indentation at line ${line.line}.`,
      );
    }
    if (!isSequenceLine(line.text)) break;

    const rest = line.text === "-" ? "" : line.text.slice(2).trim();
    index += 1;

    if (rest === "") {
      const next = lines[index];
      if (!next || next.indent <= indent) {
        array.push(null);
      } else {
        const [child, nextIndex] = parseBlock(lines, index, next.indent);
        array.push(child);
        index = nextIndex;
      }
      continue;
    }

    if (looksLikeMappingEntry(rest)) {
      const object: Record<string, unknown> = Object.create(null);
      const { key, rest: valueText } = splitKeyValue(rest, line.line);
      assertSafeYamlKey(key, line.line);

      if (valueText === "") {
        const next = lines[index];
        if (next && next.indent > indent + 2) {
          const [child, nextIndex] = parseBlock(lines, index, next.indent);
          object[key] = child;
          index = nextIndex;
        } else if (next && next.indent === indent + 2 && isSequenceLine(next.text)) {
          const [child, nextIndex] = parseBlock(lines, index, next.indent);
          object[key] = child;
          index = nextIndex;
        } else {
          object[key] = null;
        }
      } else {
        object[key] = parseScalar(valueText, line.line);
      }

      if (
        index < lines.length &&
        lines[index]!.indent === indent + 2 &&
        !isSequenceLine(lines[index]!.text)
      ) {
        const [continued, nextIndex] = parseMapping(
          lines,
          index,
          indent + 2,
          object,
        );
        array.push(continued);
        index = nextIndex;
      } else {
        array.push(object);
      }
      continue;
    }

    array.push(parseScalar(rest, line.line));
  }

  return [array, index];
}

function isSequenceLine(text: string): boolean {
  return text === "-" || text.startsWith("- ");
}

function looksLikeMappingEntry(text: string): boolean {
  return findColon(text) >= 0;
}

function splitKeyValue(
  text: string,
  line: number,
): { key: string; rest: string } {
  const colon = findColon(text);
  if (colon < 1) {
    throw new WorldSimError(
      "PARSE_ERROR",
      `Expected 'key: value' at line ${line}.`,
    );
  }

  const key = text.slice(0, colon).trim();
  const rest = text.slice(colon + 1).trim();
  return { key, rest };
}

function findColon(text: string): number {
  let quote: "'" | '"' | null = null;
  let escaped = false;
  let bracketDepth = 0;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;

    if (quote === '"') {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') quote = null;
      continue;
    }

    if (quote === "'") {
      if (char === "'") {
        if (text[i + 1] === "'") {
          i += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === "[") bracketDepth += 1;
    if (char === "]") bracketDepth -= 1;
    if (char === ":" && bracketDepth === 0) return i;
  }

  return -1;
}

function parseScalar(text: string, line: number): unknown {
  const value = text.trim();

  if (forbiddenScalarPrefixes.some((prefix) => value.startsWith(prefix))) {
    throw new WorldSimError(
      "PARSE_ERROR",
      `Unsupported YAML feature at line ${line}.`,
    );
  }

  if (value === "{}") return Object.create(null);
  if (value === "[]") return [];
  if (value === "null" || value === "~") return null;
  if (value === "true") return true;
  if (value === "false") return false;

  if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      throw new WorldSimError(
        "PARSE_ERROR",
        `Non-finite number at line ${line}.`,
      );
    }
    return number;
  }

  if (value.startsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      throw new WorldSimError(
        "PARSE_ERROR",
        `Invalid double-quoted string at line ${line}.`,
      );
    }
  }

  if (value.startsWith("'")) {
    if (!value.endsWith("'") || value.length < 2) {
      throw new WorldSimError(
        "PARSE_ERROR",
        `Invalid single-quoted string at line ${line}.`,
      );
    }
    return value.slice(1, -1).replace(/''/g, "'");
  }

  if (value.startsWith("[")) {
    if (!value.endsWith("]")) {
      throw new WorldSimError(
        "PARSE_ERROR",
        `Invalid inline sequence at line ${line}.`,
      );
    }

    const inner = value.slice(1, -1).trim();
    if (inner === "") return [];
    return splitInlineSequence(inner, line).map((item) => parseScalar(item, line));
  }

  if (value.startsWith("{")) {
    throw new WorldSimError(
      "PARSE_ERROR",
      `Inline mappings are not supported in v0.1 YAML (line ${line}).`,
    );
  }

  return value;
}

function splitInlineSequence(text: string, line: number): string[] {
  const items: string[] = [];
  let quote: "'" | '"' | null = null;
  let escaped = false;
  let current = "";

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;

    if (quote === '"') {
      current += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        quote = null;
      }
      continue;
    }

    if (quote === "'") {
      current += char;
      if (char === "'") {
        if (text[i + 1] === "'") {
          current += "'";
          i += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }

    if (char === ",") {
      if (current.trim() === "") {
        throw new WorldSimError(
          "PARSE_ERROR",
          `Empty inline sequence item at line ${line}.`,
        );
      }
      items.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (quote) {
    throw new WorldSimError(
      "PARSE_ERROR",
      `Unclosed quote in inline sequence at line ${line}.`,
    );
  }

  if (current.trim() !== "") items.push(current.trim());
  return items;
}

function assertSafeYamlKey(key: string, line: number): void {
  if (key === "<<" || key.startsWith("!") || key.startsWith("&") || key.startsWith("*")) {
    throw new WorldSimError(
      "PARSE_ERROR",
      `Unsupported YAML key at line ${line}.`,
    );
  }
  if (key === "__proto__" || key === "prototype" || key === "constructor") {
    throw new WorldSimError(
      "PARSE_ERROR",
      `Dangerous key '${key}' is not allowed (line ${line}).`,
    );
  }
}
