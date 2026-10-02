// npm run drift              full scan -> .drift/report.json
// npm run drift -- --fix     apply every auto-fix lane item, then rescan
// npm run drift -- --gate    PR gate: only lines added vs --base (default main)
import { appendFileSync, existsSync } from "node:fs";
import { parseColor } from "../lib/drift/color";
import { gateMarkdown, runGate } from "../lib/drift/gate";
import { jevApiKey } from "../lib/drift/jev";
import { runPrCheck } from "../lib/drift/pr";
import { applyAutofixes } from "../lib/drift/resolve";
import { readReport, saveReport, scan } from "../lib/drift/scan";
import type { ColorFinding, ComponentFinding, Lane, Report } from "../lib/drift/types";

try {
  process.loadEnvFile(".env.local");
} catch {}

const args = process.argv.slice(2);
const flag = (f: string) => args.includes(f);
const opt = (f: string) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  magenta: (s: string) => `\x1b[35m${s}\x1b[0m`,
};
const swatch = (raw: string) => {
  const rgb = parseColor(raw);
  return rgb ? `\x1b[48;2;${rgb[0]};${rgb[1]};${rgb[2]}m  \x1b[0m` : "  ";
};
const LANE_LABEL: Record<Lane, string> = {
  autofix: c.green("AUTO-FIX"),
  review: c.yellow("REVIEW  "),
  propose: c.magenta("PROPOSE "),
  leave: c.dim("LEAVE   "),
};
const ORDER: Lane[] = ["autofix", "review", "propose", "leave"];

function colorLine(f: ColorFinding) {
  const where = c.dim(`${f.file}:${f.line}`.padEnd(26));
  const what = `${swatch(f.raw)} ${f.raw.padEnd(17)}`;
  let why: string;
  if (f.lane === "autofix") why = `→ var(${f.best!.token})${f.subsumedBy ? c.dim("  (via component swap)") : ""}`;
  else if (f.lane === "review") why = `? ${f.best!.token}  same_role ${f.best!.sameRole.toFixed(2)}`;
  else if (f.lane === "propose") why = `+ new token ${f.proposal!.name}  (${f.proposal!.role})`;
  else why = c.dim(f.candidates[0] ? `≠ ${f.candidates[0].token}  same_role ${f.candidates[0].sameRole.toFixed(2)}` : "no token nearby");
  return `  ${LANE_LABEL[f.lane]} ${where} ${what} ${why}`;
}

function componentLine(f: ComponentFinding) {
  const where = c.dim(`${f.file}:${f.line}`.padEnd(26));
  const what = `<${f.tag} .${f.className.split(" ")[0]}>`.padEnd(24);
  const why =
    f.lane === "autofix" || f.lane === "review"
      ? `→ <${f.choice.replace("/", " variant=")}>  p=${(f.probabilities[f.choice] ?? 0).toFixed(2)}`
      : f.lane === "propose"
        ? `+ new component ${f.proposal!.name}`
        : c.dim("no component needed");
  return `  ${LANE_LABEL[f.lane]} ${where} ${what} ${why}`;
}

function print(r: Report) {
  const s = r.stats;
  console.log("");
  console.log(c.bold(`Design drift · ${r.mode === "changed" ? `lines added vs ${r.base}` : "full scan"}`));
  console.log(
    c.dim(
      `${s.literals} literals · ${s.elements} hand-styled elements · ${s.pairs} token pairs · ${s.calls} Jev calls · $${s.costUsd.toFixed(6)} · ${s.ms} ms${s.replayed ? ` · ${s.replayed} replayed` : ""}`,
    ),
  );
  console.log("");
  if (r.colors.length) {
    console.log(c.bold("Colors"));
    [...r.colors].sort((a, b) => ORDER.indexOf(a.lane) - ORDER.indexOf(b.lane)).forEach((f) => console.log(colorLine(f)));
  }
  if (r.components.length) {
    console.log("\n" + c.bold("Components"));
    [...r.components].sort((a, b) => ORDER.indexOf(a.lane) - ORDER.indexOf(b.lane)).forEach((f) => console.log(componentLine(f)));
  }
  if (!r.colors.length && !r.components.length) console.log(c.green("  No drift found."));
  if (r.accuracy && r.mode === "full") {
    const a = r.accuracy;
    console.log("");
    console.log(`  Jev routing    ${c.bold(`${a.jev.correct}/${a.jev.total}`)} correct vs answer key`);
    console.log(`  Distance only  ${a.baseline.correct}/${a.baseline.total} ${c.dim("(auto-merge when ΔE < 10)")}`);
    console.log(`  Components     ${a.components.correct}/${a.components.total}`);
  }
  console.log("");
}

async function main() {
  if (!jevApiKey() && !existsSync(".drift/jev-cache.json")) {
    console.error(c.red("No Jev API key. Set JEV_API_KEY in .env.local."));
    process.exit(2);
  }

  // CI: sticky PR comment + soft status. Always exits 0; decisions happen in Drift.
  if (flag("--pr")) {
    const env = (k: string) => {
      const v = process.env[k];
      if (!v) throw new Error(`--pr needs ${k}`);
      return v;
    };
    const pr = env("PR_NUMBER");
    const reviewUrl = `${process.env.DRIFT_URL ?? "http://localhost:3000/drift"}?pr=${pr}`;
    const { pending, body } = await runPrCheck({ base: opt("--base") ?? "origin/main", pr, repo: env("GITHUB_REPOSITORY"), sha: env("HEAD_SHA"), reviewUrl });
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, body.replace(/^<!--.*-->\n/, "") + "\n");
    console.log(body);
    console.log(pending ? c.yellow(`\n▲ ${pending} design decision(s) open. Soft check set to pending.`) : c.green("\n✔ All design decisions recorded."));
    return;
  }

  if (flag("--gate")) {
    const r = await runGate(opt("--base"));
    print(r);
    const md = gateMarkdown(r);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n");
    if (flag("--markdown")) console.log(md + "\n");
    const { status, blocking, warnings } = r.gate!;
    console.log(
      status === "fail"
        ? c.red(`✖ Gate failed: ${blocking} new item(s) already have a design-system answer. Run \`npm run drift -- --fix\`.`)
        : status === "warn"
          ? c.yellow(`▲ Gate passed with ${warnings} item(s) routed to design review.`)
          : c.green("✔ Gate passed: no new drift."),
    );
    console.log("");
    process.exit(status === "fail" ? 1 : 0);
  }

  if (flag("--fix")) {
    const before = readReport() ?? (await scan());
    const res = applyAutofixes(before);
    console.log(c.green(`\nApplied ${res.colors} token swap(s) and ${res.components} component swap(s) across ${res.files.length} file(s).`));
    const after = await scan();
    saveReport(after);
    print(after);
    return;
  }

  const r = await scan();
  saveReport(r);
  print(r);
}

main().catch((err) => {
  console.error(c.red(String(err?.stack ?? err)));
  process.exit(2);
});
