// PR review: group a branch's new drift into human-sized changes, let the author pick a
// path for each, preview every choice for real in the working tree, then commit.
// Previews are always rebuilt from HEAD, so switching choices is lossless.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { addException, addToken, loadComponents, loadConfig, loadTokens } from "./designSystem";
import { applyEdits } from "./fix";
import { scan } from "./scan";
import type { ColorFinding, ComponentFinding, Report, RunStats } from "./types";

export type ChoiceKind = "proposed" | "existing" | "keep" | "oneoff";
export type Choice = { kind: ChoiceKind; reason?: string };

export type ExistingOption =
  | { type: "component"; component: string; variant: string; p: number }
  | { type: "token"; token: string; value: string; sameRole: number };

export type KeepToken = { name: string; value: string; usage: string; isNew: boolean; nearest?: { token: string; deltaE: number } };

export type Change = {
  id: string;
  file: string;
  line: number;
  title: string;
  element?: ComponentFinding;
  colors: ColorFinding[];
  existing?: ExistingOption;
  keep: KeepToken[];
  recommended?: Exclude<ChoiceKind, "proposed" | "oneoff">;
};

export type ReviewState = {
  base: string;
  branch: string;
  head: string;
  generatedAt: string;
  stats: RunStats;
  changes: Change[];
  choices: Record<string, Choice>;
  touched: string[];
  accepted?: { sha: string; at: string; summary: string[] };
  after?: { flagged: number; ms: number };
};

const STATE = () => path.join(process.cwd(), ".drift", "review.json");
const SYSTEM_FILES = ["design-system/tokens.json", "app/tokens.css", "design-system/exceptions.json"];

const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8", cwd: process.cwd() }).trim();

export function readReview(): ReviewState | null {
  try {
    return JSON.parse(readFileSync(STATE(), "utf8"));
  } catch {
    return null;
  }
}

function saveReview(s: ReviewState) {
  mkdirSync(path.dirname(STATE()), { recursive: true });
  writeFileSync(STATE(), JSON.stringify(s, null, 2));
}

const slug = (s: string) =>
  s
    .replace(/^[.#<]/, "")
    .split(/[\s:>]/)[0]
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");

function titleFor(el?: ComponentFinding, c?: ColorFinding) {
  const s = el ? el.className.split(/\s+/)[0] : (c?.selector ?? "");
  const words = slug(s).split("-").filter(Boolean).join(" ");
  return words ? words[0].toUpperCase() + words.slice(1) : "Color value";
}

function keepTokens(colors: ColorFinding[], owner: string): KeepToken[] {
  const tokens = loadTokens();
  return colors.map((c) => {
    // Keep the designer's exact value. Reuse a token only if it's the same value and role.
    const exact = tokens.find((t) => t.value.toUpperCase() === c.hex && c.lane === "autofix" && c.best?.token === t.name);
    if (exact) return { name: exact.name, value: exact.value, usage: exact.usage, isNew: false };
    const prop = /color/i.test(c.property) && !/background/i.test(c.property) ? "fg" : "bg";
    const name = c.proposal?.name ?? `--${slug(owner)}${colors.length > 1 ? `-${prop}` : ""}`;
    const near = c.candidates[0];
    return {
      name,
      value: c.hex,
      usage: c.proposal?.usage ?? `${c.property} of ${owner} (added from a branch)`,
      isNew: true,
      nearest: near ? { token: near.token, deltaE: near.deltaE } : undefined,
    };
  });
}

function groupChanges(report: Report): Change[] {
  const changes: Change[] = [];
  const claimed = new Set<string>();
  for (const el of report.components.filter((c) => c.lane !== "leave")) {
    const colors = report.colors.filter((c) => c.file === el.file && c.start >= el.start && c.end <= el.end);
    colors.forEach((c) => claimed.add(c.id));
    const variants = Object.entries(el.probabilities)
      .filter(([k]) => k.includes("/"))
      .sort((a, b) => b[1] - a[1]);
    const top = el.choice.includes("/") ? ([el.choice, el.probabilities[el.choice] ?? 0] as const) : variants[0];
    const [component, variant] = top ? top[0].split("/") : [];
    changes.push({
      id: el.id,
      file: el.file,
      line: el.line,
      title: titleFor(el),
      element: el,
      colors,
      existing: top ? { type: "component", component, variant, p: top[1] } : undefined,
      keep: keepTokens(colors, el.className || el.tag),
      recommended: el.lane === "autofix" ? "existing" : el.lane === "propose" ? "keep" : undefined,
    });
  }
  for (const c of report.colors.filter((c) => !claimed.has(c.id) && c.lane !== "leave")) {
    const near = c.best ?? c.candidates[0];
    changes.push({
      id: c.id,
      file: c.file,
      line: c.line,
      title: titleFor(undefined, c),
      colors: [c],
      existing: near ? { type: "token", token: near.token, value: near.tokenValue, sameRole: near.sameRole } : undefined,
      keep: keepTokens([c], c.selector || c.component),
      recommended: c.lane === "autofix" ? "existing" : c.lane === "propose" ? "keep" : undefined,
    });
  }
  return changes.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

// Put every file a preview may have touched back to HEAD.
function restore(paths: string[]) {
  for (const p of new Set(paths)) {
    let tracked = true;
    try {
      git("cat-file", "-e", `HEAD:${p}`);
    } catch {
      tracked = false;
    }
    if (tracked) git("checkout", "HEAD", "--", p);
    else if (existsSync(path.join(process.cwd(), p))) rmSync(path.join(process.cwd(), p));
  }
}

export async function buildReview(): Promise<ReviewState> {
  const prev = readReview();
  if (prev && !prev.accepted) restore(prev.touched);
  const base = process.env.DRIFT_REVIEW_BASE ?? loadConfig().review.base;
  const report = await scan({ base });
  const state: ReviewState = {
    base,
    branch: git("branch", "--show-current"),
    head: git("rev-parse", "--short", "HEAD"),
    generatedAt: new Date().toISOString(),
    stats: report.stats,
    changes: groupChanges(report),
    choices: {},
    touched: [],
  };
  saveReview(state);
  return state;
}

function requestMarkdown(s: ReviewState, ch: Change): string {
  const lines = [
    `# Design system request: ${ch.title}`,
    ``,
    `From branch \`${s.branch}\`, ${ch.file}:${ch.line}. The author kept their design and added these tokens:`,
    ``,
    ...ch.keep
      .filter((k) => k.isNew)
      .map(
        (k) =>
          `- \`${k.name}: ${k.value}\` for ${k.usage}` +
          (k.nearest && k.nearest.deltaE < 12 ? `. **Near-duplicate of \`${k.nearest.token}\` (ΔE ${k.nearest.deltaE.toFixed(1)}).** Consider consolidating.` : ""),
      ),
  ];
  if (ch.element) {
    const ranked = Object.entries(ch.element.probabilities)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, p]) => `${k} ${Math.round(p * 100)}%`);
    lines.push(
      ``,
      `The element is still hand-styled. If this pattern sticks, promote it to a component variant.`,
      `Jev's closest existing match: ${ranked.join(", ")}.`,
      ``,
      "```tsx",
      ch.element.source,
      "```",
    );
  }
  return lines.join("\n") + "\n";
}

// Rebuild the working tree from HEAD plus every current choice.
export function applyChoices(s: ReviewState): ReviewState {
  restore(s.touched);
  const catalog = loadComponents();
  const touched = new Set<string>(SYSTEM_FILES);
  const colorEdits: { finding: ColorFinding; token: string }[] = [];
  const componentEdits: ComponentFinding[] = [];

  for (const ch of s.changes) {
    const choice = s.choices[ch.id];
    if (!choice || choice.kind === "proposed") continue;
    touched.add(ch.file);
    if (choice.kind === "existing" && ch.existing) {
      if (ch.existing.type === "component" && ch.element) {
        componentEdits.push({ ...ch.element, choice: `${ch.existing.component}/${ch.existing.variant}` });
      } else if (ch.existing.type === "token") {
        colorEdits.push({ finding: ch.colors[0], token: ch.existing.token });
      }
    }
    if (choice.kind === "keep") {
      ch.colors.forEach((c, i) => {
        const k = ch.keep[i];
        if (k.isNew) addToken({ name: k.name, value: k.value, usage: k.usage });
        colorEdits.push({ finding: c, token: k.name });
      });
      const req = `design-system/requests/${slug(ch.title.replace(/\s+/g, "-"))}.md`;
      mkdirSync(path.join(process.cwd(), "design-system", "requests"), { recursive: true });
      writeFileSync(path.join(process.cwd(), req), requestMarkdown(s, ch));
      touched.add(req);
    }
    if (choice.kind === "oneoff") {
      const decidedAt = new Date().toISOString();
      const reason = choice.reason?.trim() || "Intentional one-off";
      if (ch.element) addException({ file: ch.file, className: ch.element.className, reason, decidedAt });
      for (const c of ch.colors) addException({ file: ch.file, raw: c.raw, reason, decidedAt });
    }
  }
  applyEdits(colorEdits, componentEdits, catalog);
  const next = { ...s, touched: [...touched] };
  saveReview(next);
  return next;
}

export function setChoice(id: string, choice: Choice): ReviewState | null {
  const s = readReview();
  if (!s || s.accepted) return s;
  s.choices[id] = choice;
  return applyChoices(s);
}

export function branchInfo(base: string) {
  const branch = git("branch", "--show-current");
  let commits: { sha: string; author: string; subject: string }[] = [];
  try {
    commits = git("log", "--format=%h%x09%an%x09%s", `${base}..HEAD`)
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        const [sha, author, subject] = l.split("\t");
        return { sha, author, subject };
      });
  } catch {}
  return { branch, head: git("rev-parse", "--short", "HEAD"), commits };
}

// What accepting would commit right now: the preview's diff against HEAD.
export function workingDiff(s: ReviewState): string {
  if (!s.touched.length) return "";
  const tracked = git("diff", "--no-color", "HEAD", "--", ...s.touched);
  const untracked = git("ls-files", "--others", "--exclude-standard", "--", ...s.touched)
    .split("\n")
    .filter(Boolean)
    .map((f) => `+++ new file: ${f}\n` + readFileSync(path.join(process.cwd(), f), "utf8").replace(/^/gm, "+"));
  return [tracked, ...untracked].filter(Boolean).join("\n");
}

export function pendingCount(s: ReviewState) {
  return s.changes.filter((c) => !s.choices[c.id] || s.choices[c.id].kind === "proposed").length;
}

export async function acceptReview(): Promise<ReviewState | null> {
  const s = readReview();
  if (!s || s.accepted || pendingCount(s) > 0) return s;
  const summary = s.changes.map((ch) => {
    const c = s.choices[ch.id];
    if (c.kind === "existing" && ch.existing)
      return `${ch.title}: use existing ${ch.existing.type === "component" ? `${ch.existing.component} ${ch.existing.variant}` : ch.existing.token}`;
    if (c.kind === "keep") return `${ch.title}: keep design, add ${ch.keep.filter((k) => k.isNew).map((k) => k.name).join(", ") || "tokens"}`;
    return `${ch.title}: one-off (${c.reason || "intentional"})`;
  });
  const paths = s.touched.filter((p) => existsSync(path.join(process.cwd(), p)) || git("ls-files", "--", p) !== "");
  git("add", "-A", "--", ...paths);
  git("commit", "-m", `Resolve design drift review\n\n${summary.map((l) => `- ${l}`).join("\n")}`);
  const after = await scan({ base: s.base });
  const next: ReviewState = {
    ...s,
    accepted: { sha: git("rev-parse", "--short", "HEAD"), at: new Date().toISOString(), summary },
    after: {
      flagged: after.colors.filter((c) => c.lane !== "leave").length + after.components.filter((c) => c.lane !== "leave").length,
      ms: after.stats.ms,
    },
  };
  saveReview(next);
  return next;
}
