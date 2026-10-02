// extract -> block (deltaE) -> decide (Jev) -> route (code) -> report
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { deltaE, parseColor } from "./color";
import { judgeElement, judgeGap, judgePair, NEW_COMPONENT, NEW_ROLES, NOT_A_COMPONENT } from "./decide";
import { loadAnswerKey, loadComponents, loadConfig, loadExceptions, loadTokens } from "./designSystem";
import { previewColorFix, previewComponentFix } from "./fix";
import { JevSession } from "./jev";
import { extractColors, extractElements } from "./extract";
import type { ColorFinding, ComponentFinding, Lane, Report, Token } from "./types";

const BLOCK_DELTA_E = 30; // loose: only rules out obviously unrelated tokens
const MAX_CANDIDATES = 4;
const BASELINE_DELTA_E = 10; // what a distance-only linter would auto-merge
const GAP_THRESHOLD = 0.5;

// Stable handle for an element in exceptions: its own class name, else its text.
export const elementKey = (e: { className: string; text: string }) => e.className || `text:${e.text}`;

export const REPORT_PATH = () => path.join(process.cwd(), ".drift", "report.json");
export const GATE_PATH = () => path.join(process.cwd(), ".drift", "gate.json");

function listFiles(): string[] {
  const { include, extensions } = loadConfig();
  const out: string[] = [];
  const walk = (rel: string) => {
    const abs = path.join(process.cwd(), rel);
    if (!existsSync(abs)) return;
    if (statSync(abs).isDirectory()) {
      for (const f of readdirSync(abs)) walk(path.join(rel, f));
    } else if (extensions.some((e) => rel.endsWith(e))) out.push(rel.split(path.sep).join("/"));
  };
  include.forEach(walk);
  return out.sort();
}

// Lines added on this branch (vs merge-base with `base`), plus uncommitted and untracked files.
export function changedLines(base: string): Map<string, Set<number> | "all"> {
  const { include } = loadConfig();
  const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" });
  const mergeBase = git("merge-base", "HEAD", base).trim();
  const diff = git("diff", "-U0", "--no-color", mergeBase, "--", ...include);
  const out = new Map<string, Set<number> | "all">();
  let file = "";
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) {
      file = line.slice(4).replace(/^b\//, "");
      continue;
    }
    const h = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (h && file !== "/dev/null") {
      const start = Number(h[1]);
      const count = h[2] === undefined ? 1 : Number(h[2]);
      const set = (out.get(file) as Set<number>) ?? new Set<number>();
      for (let i = 0; i < count; i++) set.add(start + i);
      out.set(file, set);
    }
  }
  for (const f of git("ls-files", "--others", "--exclude-standard", "--", ...include).split("\n").filter(Boolean)) {
    out.set(f, "all");
  }
  return out;
}

function proposalName(role: string, value: string, selector: string, tokens: Token[], taken: Map<string, string>): string {
  // Same value + role => same proposed token (e.g. a brand red used in 3 places).
  const key = `${role}:${value}`;
  if (taken.has(key)) return taken.get(key)!;
  const used = new Set([...tokens.map((t) => t.name), ...taken.values()]);
  let name: string;
  if (role === "chart") {
    name = "--chart-1";
    for (let i = 2; used.has(name); i++) name = `--chart-${i}`;
  } else {
    // On collision, name it after where it lives: .promo-badge -> --promo-badge.
    const slug = selector.replace(/^[.#]/, "").split(/[\s:>]/)[0].toLowerCase();
    name = `--${role}`;
    if (used.has(name)) name = slug.startsWith(role) ? `--${slug}` : `--${role}-${slug}`;
    for (let i = 2; used.has(name); i++) name = `--${role}-${i}`;
  }
  taken.set(key, name);
  return name;
}

function pascal(s: string) {
  return s.replace(/(^|[-_\s]+)(\w)/g, (_, __, c: string) => c.toUpperCase());
}

export async function scan(opts: { base?: string } = {}): Promise<Report> {
  const t0 = performance.now();
  const tokens = loadTokens();
  const catalog = loadComponents();
  const jev = new JevSession();
  const files = listFiles();
  const filter = opts.base ? changedLines(opts.base) : null;
  const keep = (file: string, line: number) => {
    if (!filter) return true;
    const f = filter.get(file);
    return f === "all" || (f instanceof Set && f.has(line));
  };

  const sources = new Map(files.map((f) => [f, readFileSync(path.join(process.cwd(), f), "utf8")]));
  const exceptions = loadExceptions();
  const literals = files
    .flatMap((f) => extractColors(f, sources.get(f)!))
    .filter((l) => keep(l.file, l.line))
    .filter(
      (l) =>
        !exceptions.some(
          (x) => x.file === l.file && x.raw?.toLowerCase() === l.raw.toLowerCase() && (!x.selector || x.selector === l.selector),
        ),
    );
  const elements = files
    .flatMap((f) => extractElements(f, sources.get(f)!))
    .filter((e) => keep(e.file, e.line))
    .filter((e) => !exceptions.some((x) => x.file === e.file && x.className === elementKey(e)));

  // Block: nearest tokens by deltaE. Pure code.
  const blocked = literals.map((l) => {
    const rgb = parseColor(l.raw)!;
    const near = tokens
      .map((t) => ({ t, dE: deltaE(rgb, parseColor(t.value)!) }))
      .sort((a, b) => a.dE - b.dE);
    return { l, near, candidates: near.filter((n) => n.dE <= BLOCK_DELTA_E).slice(0, MAX_CANDIDATES) };
  });
  const pairs = blocked.reduce((n, b) => n + b.candidates.length, 0);

  // Decide: every (literal, token) pair and every element in parallel.
  const [judged, componentAnswers] = await Promise.all([
    Promise.all(blocked.map(async (b) => ({ ...b, judged: await Promise.all(b.candidates.map((c) => judgePair(jev, b.l, c.t, c.dE))) }))),
    Promise.all(elements.map((el) => judgeElement(jev, el, catalog))),
  ]);

  // Second wave, only for literals no existing token fits: is this a gap in the system?
  const needsGap = judged.filter((j) => !j.judged.some((c) => c.level >= 1));
  const gaps = new Map(await Promise.all(needsGap.map(async (j) => [j.l.id, await judgeGap(jev, j.l, tokens)] as const)));
  jev.saveCache();

  // Route: pure code.
  const taken = new Map<string, string>();
  const key = loadAnswerKey();
  const components: ComponentFinding[] = elements.map((el, i) => {
    const a = componentAnswers[i];
    const isVariant = a.choice !== NEW_COMPONENT && a.choice !== NOT_A_COMPONENT;
    const p = a.probabilities[a.choice] ?? 0;
    const lane: Lane = isVariant ? (p >= 0.5 ? "autofix" : "review") : a.choice === NEW_COMPONENT ? "propose" : "leave";
    const f: ComponentFinding = { ...el, ...a, lane };
    if (isVariant) f.fix = previewComponentFix(sources.get(el.file)!, f, catalog);
    if (lane === "propose") {
      const closest = Object.entries(a.probabilities)
        .filter(([k]) => k !== NEW_COMPONENT && k !== NOT_A_COMPONENT)
        .sort((x, y) => y[1] - x[1])[0];
      f.proposal = {
        name: pascal(el.className.split(/\s+/)[0] || el.tag),
        brief: `Hand-rolled <${el.tag}> "${el.text}" in ${el.file}. No existing variant fits${closest ? `; closest is ${closest[0]} (${Math.round(closest[1] * 100)}%)` : ""}.`,
      };
    }
    const exp = key?.components.find((k) => k.file === el.file && k.className === el.className);
    if (exp) f.expected = { lane: exp.lane, component: exp.component, why: exp.why };
    return f;
  });

  const colors: ColorFinding[] = judged.map(({ l, near, judged: cands }) => {
    cands.sort((a, b) => b.score - a.score);
    const best = cands[0] ?? null;
    let lane: Lane = best && best.level === 2 ? "autofix" : best && best.level === 1 ? "review" : "leave";
    const f: ColorFinding = {
      ...l,
      candidates: cands,
      best,
      lane,
      baselineLane: near[0].dE < BASELINE_DELTA_E ? "autofix" : "leave",
      baselineToken: near[0].dE < BASELINE_DELTA_E ? near[0].t.name : undefined,
    };
    const gap = gaps.get(l.id);
    if (gap) f.gap = gap.gap;
    if (gap && gap.gap >= GAP_THRESHOLD) {
      lane = "propose";
      const name = proposalName(gap.role, l.hex, l.selector || l.component, tokens, taken);
      f.proposal = { name, role: gap.role, gap: gap.gap, usage: `${NEW_ROLES[gap.role] ?? gap.role} (first seen on ${l.selector || l.component})` };
      f.fix = previewColorFix(sources.get(l.file)!, f, name);
    }
    f.lane = lane;
    if (lane === "autofix" && best) f.fix = previewColorFix(sources.get(l.file)!, f, best.token);
    const owner = components.find((c) => c.lane === "autofix" && c.file === l.file && l.start >= c.start && l.end <= c.end);
    if (owner) f.subsumedBy = owner.id;
    const exp = key?.colors.find((k) => k.file === l.file && k.raw.toLowerCase() === l.raw.toLowerCase());
    if (exp) f.expected = { lane: exp.lane, token: exp.token, why: exp.why };
    return f;
  });

  const scored = colors.filter((c) => c.expected);
  const right = (lane: Lane, token: string | undefined, exp: NonNullable<ColorFinding["expected"]>) =>
    lane === exp.lane && (lane !== "autofix" || token === exp.token);
  const scoredComponents = components.filter((c) => c.expected);

  const report: Report = {
    generatedAt: new Date().toISOString(),
    mode: opts.base ? "changed" : "full",
    base: opts.base,
    stats: {
      files: files.length,
      literals: literals.length,
      elements: elements.length,
      pairs,
      calls: jev.calls,
      replayed: jev.replayed,
      inputTokens: jev.inputTokens,
      costUsd: jev.costUsd,
      ms: Math.round(performance.now() - t0),
      avgCallMs: jev.callMs.length ? Math.round(jev.callMs.reduce((a, b) => a + b, 0) / jev.callMs.length) : 0,
    },
    colors,
    components,
    accuracy: scored.length
      ? {
          jev: { correct: scored.filter((c) => right(c.lane, c.best?.token, c.expected!)).length, total: scored.length },
          baseline: { correct: scored.filter((c) => right(c.baselineLane, c.baselineToken, c.expected!)).length, total: scored.length },
          components: {
            correct: scoredComponents.filter((c) => c.lane === c.expected!.lane && (c.lane !== "autofix" || c.choice === c.expected!.component)).length,
            total: scoredComponents.length,
          },
        }
      : undefined,
  };
  return report;
}

export function saveReport(report: Report, file = REPORT_PATH()) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(report, null, 2));
}

export function readReport(file = REPORT_PATH()): Report | null {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}
