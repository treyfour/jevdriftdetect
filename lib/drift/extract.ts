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
    // Tailwind arbitrary value, optionally behind a state variant: hover:bg-[#4f46e5]
    const tw = before.match(/(?:([a-z-]+):)?([a-z]+)-\[$/);
    if (tw) {
      syntax = "tailwind";
      property = (tw[1] ? `${tw[1]} ` : "") + (TAILWIND_PROPS[tw[2]] ?? tw[2]);
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

// Hand-styled elements: <button|span|div|a ...>text</tag> whose inline style or Tailwind
// classes carry a color literal. An inline <svg> icon child is allowed (and noted).
const OPEN_RE = /<(button|span|div|a)\b((?:[^>"{]|"[^"]*"|\{\{[^}]*\}\}|\{[^{}]*\})*)>/g;
const UTILITY =
  /^(inline|flex|grid|items|justify|self|place|rounded|text|bg|p[xytrbl]?|m[xytrbl]?|font|hover|focus|gap|border|shadow|ring|outline|whitespace|leading|tracking|size|w|h|min|max|transition|duration|cursor|select|overflow|shrink|grow|line|z|opacity|space|divide|underline|truncate|sr)(-|$)/;

// The author's own class name ("send-button"), ignoring Tailwind utilities. "" if none.
function semanticClass(classes: string): string {
  return classes.split(/\s+/).find((c) => /^[a-z]+(-[a-z]+)*$/.test(c) && !UTILITY.test(c)) ?? "";
}

const ARBITRARY_COLOR = /-\[(?:#[0-9a-fA-F]{3,8}|rgba?\([^\]]+\))\]/;

export function extractElements(file: string, src: string): HandRolledElement[] {
  if (!file.endsWith(".tsx")) return [];
  const starts = lineStarts(src);
  const out: HandRolledElement[] = [];
  for (const m of src.matchAll(OPEN_RE)) {
    const [open, tag, attrsRaw] = m;
    if (attrsRaw.trim().endsWith("/")) continue; // self-closing
    const start = m.index!;
    const close = src.indexOf(`</${tag}>`, start + open.length);
    if (close === -1) continue;
    const inner = src.slice(start + open.length, close);
    const icon = inner.match(/<svg[\s\S]*?<\/svg>/)?.[0];
    const text = inner.replace(/<svg[\s\S]*?<\/svg>/, "").trim();
    // Only simple elements: text (plus an optional icon), no nested markup or expressions.
    if (!text || /[<{]/.test(text)) continue;
    const style = attrsRaw.match(/style=\{\{([^}]*)\}\}/)?.[1]?.trim() ?? "";
    const classes = attrsRaw.match(/className="([^"]+)"/)?.[1] ?? "";
    COLOR_RE.lastIndex = 0;
    const styled = (style && COLOR_RE.test(style)) || ARBITRARY_COLOR.test(classes);
    if (!styled) continue;
    const attrs = attrsRaw
      .replace(/\s*style=\{\{[^}]*\}\}/, "")
      .replace(/\s*className="[^"]*"/, "")
      .replace(/\s+/g, " ")
      .trim();
    const end = close + `</${tag}>`.length;
    out.push({
      id: `${file}:el:${start}`,
      file,
      line: lineOf(starts, start),
      start,
      end,
      tag,
      className: semanticClass(classes),
      text,
      style,
      classes,
      icon,
      attrs,
      source: src.slice(start, end),
    });
  }
  return out;
}
