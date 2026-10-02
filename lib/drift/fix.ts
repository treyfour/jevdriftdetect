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

// "module::Name" pairs, merged into existing import lines when applied.
type Imports = string[];

// Render a catalog template into real code: <Button variant="outline"><SparklesIcon />Summarize</Button>
export function componentCode(f: ComponentFinding, catalog: ComponentSpec[]): { code: string; imports: Imports } {
  const [name, variant] = f.choice.split("/");
  const spec = catalog.find((c) => c.name === name)!;
  const text = f.text.replace(/\s*[▾▼⌄]\s*$/, "").trim(); // components draw their own chevrons
  const icon = f.icon && f.lucide ? `<${f.lucide} />` : "";
  const code = spec.template
    .replace("{variant}", variant && variant !== "default" ? ` variant="${variant}"` : "")
    .replace("{attrs}", f.attrs ? ` ${f.attrs}` : "")
    .replace("{icon}", icon)
    .replace("{children}", text)
    .replaceAll("{text}", text);
  const used = spec.exports.filter((e) => new RegExp(`<${e}[\\s/>]`).test(code));
  const imports = used.map((e) => `${spec.import}::${e}`);
  if (icon) imports.push(`lucide-react::${f.lucide}`);
  return { code, imports };
}

export function componentEdit(f: ComponentFinding, catalog: ComponentSpec[]): Edit & { imports: Imports } {
  const { code, imports } = componentCode(f, catalog);
  return { start: f.start, end: f.end, text: code, imports };
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

// Add `name` from `module`, merging into an existing `import { … } from "module";` line.
function addImport(src: string, spec: string): string {
  const [module, name] = spec.split("::");
  const esc = module.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  const existing = src.match(new RegExp(`^import \\{([^}]*)\\} from "${esc}";?$`, "m"));
  if (existing) {
    const names = existing[1].split(",").map((n) => n.trim()).filter(Boolean);
    if (names.includes(name)) return src;
    const merged = `import { ${[...names, name].sort().join(", ")} } from "${module}";`;
    return src.replace(existing[0], merged);
  }
  const line = `import { ${name} } from "${module}";`;
  const imports = [...src.matchAll(/^import .*;$/gm)];
  if (!imports.length) return line + "\n\n" + src;
  const last = imports[imports.length - 1];
  const at = last.index! + last[0].length;
  return src.slice(0, at) + "\n" + line + src.slice(at);
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
    e.imports.forEach((i) => b.imports.add(i));
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
