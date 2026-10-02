import { readFileSync } from "node:fs";
import path from "node:path";
import { addToken, loadComponents } from "./designSystem";
import { applyEdits, type ApplyResult } from "./fix";
import type { ColorFinding, ComponentFinding, Report } from "./types";

// Findings carry offsets from scan time; skip any whose source has moved since.
function fresh<T extends { file: string; start: number; end: number }>(items: T[], text: (t: T) => string): T[] {
  const cache = new Map<string, string>();
  const src = (f: string) => cache.get(f) ?? cache.set(f, readFileSync(path.join(process.cwd(), f), "utf8")).get(f)!;
  return items.filter((i) => src(i.file).slice(i.start, i.end) === text(i));
}

// Engineer path: everything Jev placed in the auto-fix lane, tokens and components.
export function applyAutofixes(report: Report): ApplyResult {
  const colors = fresh(
    report.colors.filter((c) => c.lane === "autofix" && c.best),
    (c) => c.raw,
  ).map((finding) => ({ finding, token: finding.best!.token }));
  const components = fresh(
    report.components.filter((c) => c.lane === "autofix"),
    (c) => c.source,
  );
  return applyEdits(colors, components, loadComponents());
}

// Designer path: accept a proposed token into the design system, then point every
// literal that proposed it at the new token.
export function acceptProposal(report: Report, tokenName: string): ApplyResult {
  const matches = report.colors.filter((c) => c.lane === "propose" && c.proposal?.name === tokenName);
  if (!matches.length) throw new Error(`No proposal named ${tokenName}`);
  const p = matches[0].proposal!;
  addToken({ name: p.name, value: matches[0].hex, usage: p.usage });
  return applyEdits(
    fresh(matches, (c) => c.raw).map((finding) => ({ finding, token: tokenName })),
    [],
    loadComponents(),
  );
}

export function designRequest(report: Report, f: ColorFinding | ComponentFinding): string {
  if ("hex" in f && f.proposal) {
    const uses = report.colors.filter((c) => c.proposal?.name === f.proposal!.name);
    const siblings = report.colors.filter((c) => c.proposal && c.proposal.role === f.proposal!.role && c.proposal.name !== f.proposal!.name);
    return [
      `## Design system request: new token \`${f.proposal.name}\``,
      ``,
      `**Value:** \`${f.hex}\`  `,
      `**Role:** ${f.proposal.usage}  `,
      `**Why it isn't an existing token:** nearest by color is \`${f.candidates[0]?.token ?? "none"}\`` +
        (f.candidates[0] ? ` (ΔE ${f.candidates[0].deltaE.toFixed(1)}), but Jev judged a different role (same_role ${f.candidates[0].sameRole.toFixed(2)}).` : "."),
      ``,
      `**Used in:**`,
      ...uses.map((u) => `- \`${u.file}:${u.line}\` · \`${u.selector || u.component}\` · ${u.property}`),
      ...(siblings.length
        ? [
            ``,
            `**Consider consolidating:** the same "${f.proposal.role}" role also appears as ` +
              siblings.map((s) => `\`${s.hex}\` (\`${s.proposal!.name}\`, ${s.selector})`).join(", ") +
              `. One token may cover both.`,
          ]
        : []),
    ].join("\n");
  }
  const c = f as ComponentFinding;
  return [
    `## Design system request: new component \`${c.proposal?.name}\``,
    ``,
    c.proposal?.brief ?? "",
    ``,
    "```tsx",
    c.source,
    "```",
  ].join("\n");
}
