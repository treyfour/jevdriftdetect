// PR gate: judge only what this branch adds. Engineers keep building freely; anything
// that already has a design-system answer blocks, anything net-new goes to design review.
import { loadConfig } from "./designSystem";
import { designRequest } from "./resolve";
import { GATE_PATH, saveReport, scan } from "./scan";
import type { Lane, Report } from "./types";

export async function runGate(baseOverride?: string): Promise<Report> {
  const { gate } = loadConfig();
  const r = await scan({ base: baseOverride ?? process.env.DRIFT_BASE ?? gate.base });
  const lanes = [...r.colors.map((f) => f.lane), ...r.components.map((f) => f.lane)];
  const blocking = lanes.filter((l) => gate.block.includes(l)).length;
  const warnings = lanes.filter((l) => gate.warn.includes(l)).length;
  r.gate = { status: blocking ? "fail" : warnings ? "warn" : "pass", blocking, warnings };
  saveReport(r, GATE_PATH());
  return r;
}

export function gateMarkdown(r: Report): string {
  const { gate } = loadConfig();
  const block: Lane[] = gate.block;
  const rows = [
    ...r.colors
      .filter((f) => f.lane !== "leave")
      .map((f) => `| ${f.lane} | \`${f.file}:${f.line}\` | \`${f.raw}\` | ${f.lane === "propose" ? `new token \`${f.proposal!.name}\`` : `\`var(${f.best!.token})\``} |`),
    ...r.components
      .filter((f) => f.lane !== "leave")
      .map((f) => `| ${f.lane} | \`${f.file}:${f.line}\` | \`<${f.tag}>\` "${f.text}" | ${f.lane === "propose" ? `new component \`${f.proposal!.name}\`` : `\`<${f.choice.replace("/", " variant=")}>\``} |`),
  ];
  const proposals = [...r.colors, ...r.components].filter((f) => f.lane === "propose");
  return [
    `### Design drift gate: ${r.gate?.status.toUpperCase()}`,
    ``,
    `Blocking lanes: ${block.join(", ")}. Only lines added on this branch are judged.`,
    ``,
    rows.length ? `| lane | where | value | resolution |\n|---|---|---|---|\n${rows.join("\n")}` : `No new drift.`,
    ``,
    rows.some((x) => x.startsWith("| autofix")) ? `Fix locally with \`npm run drift -- --fix\`.` : ``,
    ...(proposals.length
      ? [``, `<details><summary>Design system requests (${proposals.length})</summary>`, ``, ...proposals.map((p) => designRequest(r, p)), `</details>`]
      : []),
  ].join("\n");
}
