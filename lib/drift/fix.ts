// Turns decisions into concrete source edits. Edits are computed against the original
// file and applied back-to-front, so token swaps and component swaps never collide.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ColorFinding, ComponentFinding, ComponentSpec, Fix } from "./types";

type Edit = { start: number; end: number; text: string };

export function colorEdit(f: ColorFinding, tokenName: string): Edit {
  if (f.syntax === "tailwind") return { start: f.start - 1, end: f.end + 1, text: `(${tokenName})` };
  return { start: f.start, end: f.end, text: `var(${tokenName})` };
}

export function componentEdit(f: ComponentFinding, catalog: ComponentSpec[]): Edit & { importLine: string } {
  const [name, variant] = f.choice.split("/");
  const spec = catalog.find((c) => c.name === name)!;
  const attrs = f.attrs ? ` ${f.attrs}` : "";
  return {
    start: f.start,
    end: f.end,
    text: `<${name} variant="${variant}"${attrs}>${f.text}</${name}>`,
    importLine: `import { ${name} } from "${spec.import}";`,
  };
}

function previewLine(src: string, e: Edit): Fix {
  const ls = src.lastIndexOf("\n", e.start - 1) + 1;
  const leRaw = src.indexOf("\n", e.end);
  const le = leRaw === -1 ? src.length : leRaw;
  return {
    replacement: e.text,
    before: src.slice(ls, le).trim(),
    after: (src.slice(ls, e.start) + e.text + src.slice(e.end, le)).trim(),
  };
}

export function previewColorFix(src: string, f: ColorFinding, tokenName: string): Fix {
  return previewLine(src, colorEdit(f, tokenName));
}

export function previewComponentFix(src: string, f: ComponentFinding, catalog: ComponentSpec[]): Fix {
  return previewLine(src, componentEdit(f, catalog));
}

function addImport(src: string, importLine: string): string {
  if (src.includes(importLine)) return src;
  const imports = [...src.matchAll(/^import .*;$/gm)];
  if (!imports.length) return importLine + "\n\n" + src;
  const last = imports[imports.length - 1];
  const at = last.index! + last[0].length;
  return src.slice(0, at) + "\n" + importLine + src.slice(at);
}

export type ApplyResult = { files: string[]; colors: number; components: number };

// Apply a set of resolutions. `colorTokens` maps color finding id -> token name to use
// (an existing token for autofix, or a freshly accepted proposal).
export function applyEdits(
  colors: { finding: ColorFinding; token: string }[],
  components: ComponentFinding[],
  catalog: ComponentSpec[],
): ApplyResult {
  const byFile = new Map<string, { edits: Edit[]; imports: Set<string> }>();
  const bucket = (file: string) => {
    if (!byFile.has(file)) byFile.set(file, { edits: [], imports: new Set() });
    return byFile.get(file)!;
  };

  for (const c of components) {
    const e = componentEdit(c, catalog);
    const b = bucket(c.file);
    b.edits.push(e);
    b.imports.add(e.importLine);
  }
  const swapped = (f: ColorFinding) =>
    components.some((c) => c.file === f.file && f.start >= c.start && f.end <= c.end);
  for (const { finding, token } of colors) {
    if (swapped(finding)) continue; // the component swap removes this inline style entirely
    bucket(finding.file).edits.push(colorEdit(finding, token));
  }

  let colorCount = 0;
  for (const [file, { edits, imports }] of byFile) {
    const abs = path.join(process.cwd(), file);
    let src = readFileSync(abs, "utf8");
    edits.sort((a, b) => b.start - a.start);
    for (const e of edits) src = src.slice(0, e.start) + e.text + src.slice(e.end);
    for (const imp of imports) src = addImport(src, imp);
    writeFileSync(abs, src);
    colorCount += edits.length - [...edits].filter((e) => e.text.startsWith("<")).length;
  }
  return { files: [...byFile.keys()], colors: colorCount, components: components.length };
}
