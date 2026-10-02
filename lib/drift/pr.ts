// CI side of the review: one sticky PR comment + a soft commit status that link into Drift.
// Runs in GitHub Actions with GH_TOKEN; uses the gh CLI, which every hosted runner has.
import { execFileSync } from "node:child_process";
import { groupChanges, type Change } from "./review";
import { scan } from "./scan";
import type { Report } from "./types";

const MARKER = "<!-- drift-review -->";
const gh = (args: string[], input?: string) => execFileSync("gh", args, { encoding: "utf8", input });
const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
const pct = (n: number) => `${Math.round(n * 100)}%`;

function read(ch: Change): string {
  const el = ch.element;
  if (el && ch.existing?.type === "component") {
    const name = `\`${ch.existing.component}${ch.existing.variant !== "default" ? ` ${ch.existing.variant}` : ""}\``;
    const icon = el.icon ? ` Hand-drawn SVG; Lucide has \`${el.lucide ?? "an icon"}\`.` : "";
    return `Same job as ${name} (${pct(ch.existing.p)}).${icon}`;
  }
  const c = ch.colors[0];
  const near = c.best ?? c.candidates[0];
  return near ? `\`${c.raw}\` is ΔE ${near.deltaE.toFixed(1)} from \`${near.token}\`, ${pct(near.sameRole)} same role.` : `\`${c.raw}\` matches no token.`;
}

function colorsOf(ch: Change): string {
  return ch.colors.map((c) => `\`${c.raw}\``).join(" ") || "—";
}

// Decisions recorded by Drift's accept commits on this branch.
function decisions(base: string): string[] {
  const log = git("log", "--format=%B%x00", `${base}..HEAD`);
  return log
    .split("\0")
    .filter((m) => m.trim().startsWith("Resolve design drift review"))
    .flatMap((m) => m.split("\n").filter((l) => l.startsWith("- ")).map((l) => l.slice(2)));
}

export function commentBody(report: Report, changes: Change[], base: string, reviewUrl: string): string {
  const decided = decisions(base);
  if (!changes.length) {
    return [
      MARKER,
      `### ✅ Drift: design decisions recorded`,
      ``,
      decided.length ? decided.map((d) => `- ${d}`).join("\n") : `No new design drift in this PR.`,
      ``,
      `<sub>${report.stats.literals} new colors and ${report.stats.elements} new elements checked by Jev in ${report.stats.ms} ms.</sub>`,
    ].join("\n");
  }
  const rows = changes.map(
    (ch, i) => `| ${i + 1} | **${ch.title}** | \`${ch.file}:${ch.line}\` | ${colorsOf(ch)} | ${read(ch)} |`,
  );
  return [
    MARKER,
    `### 🎨 Drift: ${changes.length} design decision${changes.length === 1 ? "" : "s"} needed`,
    ``,
    `This PR adds UI that doesn't use the design system yet. **Nothing is blocked**: pick a path for each change. Use what exists, keep your design (it becomes tokens plus a design request), or record a one-off.`,
    ``,
    `| | Change | Where | Hardcoded | Jev's read |`,
    `|---|---|---|---|---|`,
    ...rows,
    ``,
    `**[Review and decide in Drift →](${reviewUrl})**`,
    ...(decided.length ? [``, `Already decided on this branch:`, ...decided.map((d) => `- ${d}`)] : []),
    ``,
    `<sub>Jev checked ${report.stats.literals} new colors and ${report.stats.elements} new elements in ${report.stats.ms} ms · ${report.stats.calls} calls · $${report.stats.costUsd.toFixed(4)}</sub>`,
  ].join("\n");
}

export async function runPrCheck(opts: { base: string; pr: string; repo: string; sha: string; reviewUrl: string }) {
  const report = await scan({ base: opts.base });
  const changes = groupChanges(report);
  const body = commentBody(report, changes, opts.base, opts.reviewUrl);

  // Upsert the single sticky comment.
  const existing = gh(["api", `repos/${opts.repo}/issues/${opts.pr}/comments`, "--paginate", "--jq", `.[] | select(.body | startswith("${MARKER}")) | .id`])
    .split("\n")
    .filter(Boolean)[0];
  if (existing) gh(["api", "-X", "PATCH", `repos/${opts.repo}/issues/comments/${existing}`, "-F", "body=@-"], body);
  else gh(["api", "-X", "POST", `repos/${opts.repo}/issues/${opts.pr}/comments`, "-F", "body=@-"], body);

  // Soft check: pending while decisions are open, never a red failure.
  const pending = changes.length;
  gh([
    "api",
    "-X",
    "POST",
    `repos/${opts.repo}/statuses/${opts.sha}`,
    "-f",
    `state=${pending ? "pending" : "success"}`,
    "-f",
    "context=Drift / design decisions",
    "-f",
    `description=${pending ? `${pending} decision${pending === 1 ? "" : "s"} needed in Drift` : "All design decisions recorded"}`,
    "-f",
    `target_url=${opts.reviewUrl}`,
  ]);
  return { pending, body };
}
