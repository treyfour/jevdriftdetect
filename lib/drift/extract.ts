// Extraction is plain code: regex every color literal and every hand-styled element,
// and capture just enough context (property, selector, component) for Jev to judge role.
import { parseColor, toHex } from "./color";
import type { ColorLiteral, HandRolledElement } from "./types";

const COLOR_RE = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*[\d.]+\s*)?\)/g;

const TAILWIND_PROPS: Record<string, string> = {
  text: "color",
  bg: "background",
  border: "border-color",
  ring: "outline",
  fill: "fill",
  stroke: "stroke",
};

function lineStarts(src: string): number[] {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === "\n") starts.push(i + 1);
  return starts;
}

function lineOf(starts: number[], offset: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

export function extractColors(file: string, src: string): ColorLiteral[] {
  const starts = lineStarts(src);
  const isCss = file.endsWith(".css");
  const out: ColorLiteral[] = [];

  for (const m of src.matchAll(COLOR_RE)) {
    const rgb = parseColor(m[0]);
    if (!rgb) continue;
    const start = m.index!;
    const line = lineOf(starts, start);
    const lineStart = starts[line - 1];
    const lineText = src.slice(lineStart, src.indexOf("\n", start) === -1 ? undefined : src.indexOf("\n", start));
    const before = src.slice(lineStart, start);
    const upToHere = src.slice(0, start);

    let syntax: ColorLiteral["syntax"] = isCss ? "css" : "inline";
    let property = "";
    const tw = before.match(/([a-z]+)-\[$/);
    if (tw) {
      syntax = "tailwind";
      property = TAILWIND_PROPS[tw[1]] ?? tw[1];
    } else {
      const p = before.match(/([A-Za-z-]+)\s*:\s*[^:;{}]*$/);
      property = p ? p[1] : "";
    }

    let selector = "";
    let component = "";
    if (isCss) {
      const sels = [...upToHere.matchAll(/([^{}\n]+)\{/g)];
      selector = sels.length ? sels[sels.length - 1][1].trim() : "";
    } else {
      const classes = [...lineText.matchAll(/className="([^"]+)"/g)];
      const owner = classes.filter((c) => c.index! < start - lineStart).pop() ?? classes[0];
      if (owner) selector = "." + owner[1].split(/\s+/)[0];
      const fns = [...upToHere.matchAll(/function\s+([A-Z]\w*)/g)];
      component = fns.length ? fns[fns.length - 1][1] : "";
    }

    out.push({
      id: `${file}:${line}:${start}`,
      file,
      line,
      start,
      end: start + m[0].length,
      raw: m[0],
      hex: toHex(rgb),
      property,
      selector,
      component,
      context: lineText.trim().slice(0, 220),
      syntax,
    });
  }
  return out;
}

// Hand-styled elements: <button|span|div|a ... style={{ ... }} ...>text</tag>
// with a color literal in the inline style. Candidates for an existing component.
const ELEMENT_RE = /<(button|span|div|a)\b([^>]*?)\sstyle=\{\{([^}]*)\}\}([^>]*)>([^<{]+)<\/\1>/g;

export function extractElements(file: string, src: string): HandRolledElement[] {
  if (!file.endsWith(".tsx")) return [];
  const starts = lineStarts(src);
  const out: HandRolledElement[] = [];
  for (const m of src.matchAll(ELEMENT_RE)) {
    const [source, tag, pre, style, post, text] = m;
    // Self-closing tags (`<div style={{..}} />`) aren't wrapping text; skip them.
    if (!text.trim() || post.trim().endsWith("/")) continue;
    COLOR_RE.lastIndex = 0;
    if (!COLOR_RE.test(style)) continue;
    const attrsAll = `${pre} ${post}`;
    const className = attrsAll.match(/className="([^"]+)"/)?.[1] ?? "";
    const attrs = attrsAll.replace(/\s*className="[^"]*"/, "").replace(/\s+/g, " ").trim();
    const start = m.index!;
    out.push({
      id: `${file}:el:${start}`,
      file,
      line: lineOf(starts, start),
      start,
      end: start + source.length,
      tag,
      className,
      text: text.trim(),
      style: style.trim(),
      attrs,
      source,
    });
  }
  return out;
}
