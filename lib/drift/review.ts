// PR review: group a branch's new drift into human-sized changes, let the author pick a
// path for each, preview every choice for real in the working tree, then commit.
// Previews are always rebuilt from HEAD, so switching choices is lossless.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { addException, addToken, loadComponents, loadConfig, loadTokens } from "./designSystem";
import { applyEdits } from "./fix";
import { elementKey, scan } from "./scan";
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
  accepted?: { sha: string; at: string; summary: string[]; pushed: boolean; pushError?: string };
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
  if (el && !el.className) return `${el.text} ${el.tag === "a" ? "link" : el.tag}`;
  const s = el ? el.className : (c?.selector ?? "");
  const words = slug(s).split("-").filter(Boolean).join(" ");
  return words ? words[0].toUpperCase() + words.slice(1) : "Color value";
}

function keepTokens(colors: ColorFinding[], owner: string): KeepToken[] {
  const tokens = loadTokens();
  return colors.map((c) => {
    // Keep the designer's exact value. Reuse a token only if it's the same value and role.
    const exact = tokens.find((t) => t.value.toUpperCase() === c.hex && c.lane === "autofix" && c.best?.token === t.name);
    if (exact) return { name: exact.name, value: exact.value, usage: exact.usage, isNew: false };
    const state = c.property.includes(" ") ? `-${c.property.split(" ")[0]}` : ""; // hover background -> -hover
    const prop = /color/i.test(c.property) && !/background/i.test(c.property) ? "fg" : "bg";
    // Inside an element, name tokens after the element; a lone color can use Jev's role name.
    const name = (colors.length === 1 && c.proposal?.name) || `--${slug(owner)}${colors.length > 1 ? `-${prop}${state}` : ""}`;
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

export function groupChanges(report: Report): Change[] {
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
      keep: keepTokens(colors, el.className || `${el.text}-${el.tag}`),
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
    const ex = ch.existing?.type === "component" ? ch.existing : undefined;
    lines.push(
      ``,
      ex && ex.p >= 0.5
        ? `Jev matched this to **${ex.component} ${ex.variant}** (${Math.round(ex.p * 100)}%), but the designer chose a custom look. Suggested follow-up: add it as a \`${ex.component}\` variant so the next picker doesn't need inline styles.`
        : `No existing component fits well. Suggested follow-up: design a new component for this pattern.`,
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
      if (ch.element) addException({ file: ch.file, className: elementKey(ch.element), reason, decidedAt });
      for (const c of ch.colors) addException({ file: ch.file, raw: c.raw, selector: c.selector, reason, decidedAt });
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

// Push the resolution commit so the PR's Drift check reruns and updates its comment.
// Only when the branch tracks a remote; a local-only demo just commits.
function push(): { pushed: boolean; pushError?: string } {
  try {
    git("rev-parse", "--abbrev-ref", "@{upstream}");
  } catch {
    return { pushed: false };
  }
  try {
    git("push");
    return { pushed: true };
  } catch (err) {
    return { pushed: false, pushError: String(err).split("\n")[0].slice(0, 200) };
  }
}

// The open PR for this branch, via the local gh CLI. Null when gh is missing or there's no PR.
export function pullRequest(): { number: number; url: string; title: string; checks: string } | null {
  try {
    const out = execFileSync("gh", ["pr", "view", "--json", "number,url,title,statusCheckRollup"], { encoding: "utf8", timeout: 5000, cwd: process.cwd() });
    const pr = JSON.parse(out) as { number: number; url: string; title: string; statusCheckRollup: { context?: string; name?: string; state?: string; status?: string; conclusion?: string }[] };
    const drift = pr.statusCheckRollup.find((c) => (c.context ?? c.name ?? "").startsWith("Drift"));
    return { number: pr.number, url: pr.url, title: pr.title, checks: drift?.state ?? drift?.conclusion ?? drift?.status ?? "" };
  } catch {
    return null;
  }
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
    accepted: { sha: git("rev-parse", "--short", "HEAD"), at: new Date().toISOString(), summary, ...push() },
    after: {
      flagged: after.colors.filter((c) => c.lane !== "leave").length + after.components.filter((c) => c.lane !== "leave").length,
      ms: after.stats.ms,
    },
  };
  saveReview(next);
  return next;
}
