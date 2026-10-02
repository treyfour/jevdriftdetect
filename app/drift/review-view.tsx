import * as Lucide from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { loadComponents, loadConfig } from "@/lib/drift/designSystem";
import { componentCode } from "@/lib/drift/fix";
import { branchInfo, pendingCount, pullRequest, readReview, workingDiff, type Change, type ChoiceKind, type ReviewState } from "@/lib/drift/review";
import { acceptReviewAction, buildReviewAction, resetChoicesAction } from "./actions";
import { ActionButton } from "./buttons";
import { ChoiceGroup, PreviewFrame, type ChoiceOption } from "./review-client";

const pct = (n: number) => `${Math.round(n * 100)}%`;

const UNITLESS = new Set(["fontWeight", "opacity", "lineHeight", "zIndex", "flex"]);
const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

// `{ background: "#7C5CFC", padding: "4px 12px", borderRadius: 999 }` -> CSS text
function styleToCss(body: string): string {
  return body
    .split(/,(?=(?:[^"']*["'][^"']*["'])*[^"']*$)/)
    .map((part) => part.match(/^\s*([A-Za-z]+)\s*:\s*(.+?)\s*$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map(([, k, v]) => {
      const val = /^["']/.test(v) ? v.slice(1, -1) : UNITLESS.has(k) ? v : `${v}px`;
      return `${kebab(k)}:${val}`;
    })
    .join(";");
}

// Render the branch's markup as written. Arbitrary color utilities become inline styles,
// because once a preview swaps them out of the source, Tailwind stops generating them.
function jsxToHtml(src: string): string {
  return src
    .replace(/style=\{\{([^}]*)\}\}/g, (_, body) => `style="${styleToCss(body)}"`)
    .replace(/className="([^"]*)"/g, (_, cls: string) => {
      const styles: string[] = [];
      const kept = cls.split(/\s+/).filter((c) => {
        const m = c.match(/^(bg|text|border)-\[(#[0-9a-fA-F]{3,8}|rgba?\([^\]]+\))\]$/);
        if (m) styles.push(`${m[1] === "bg" ? "background-color" : m[1] === "text" ? "color" : "border-color"}:${m[2]}`);
        return !m && !/^[a-z-]+:[a-z]+-\[/.test(c);
      });
      return `class="${kept.join(" ")}"` + (styles.length ? ` style="${styles.join(";")}"` : "");
    })
    .replace(/\b(strokeWidth|strokeLinecap|strokeLinejoin|fillRule|clipRule)=/g, (_, a: string) => `${kebab(a)}=`)
    .replace(/=\{(\d+(?:\.\d+)?)\}/g, '="$1"');
}

function Proposed({ ch }: { ch: Change }) {
  if (ch.element) return <span className="r-live" dangerouslySetInnerHTML={{ __html: jsxToHtml(ch.element.source) }} />;
  return <span className="r-swatch" style={{ background: ch.colors[0].hex }} />;
}

const ICONS = Lucide as unknown as Record<string, ComponentType<{ className?: string }>>;

function Existing({ ch }: { ch: Change }) {
  const ex = ch.existing;
  if (!ex) return <span className="r-none">Nothing in the system is close.</span>;
  if (ex.type === "token") return <span className="r-swatch" style={{ background: ex.value }} />;
  const el = ch.element!;
  const text = el.text.replace(/\s*[▾▼⌄]\s*$/, "");
  const Icon = el.icon && el.lucide ? ICONS[el.lucide] : undefined;
  const v = ex.variant as never;
  const kids: ReactNode = (
    <>
      {Icon && <Icon />}
      {text}
    </>
  );
  switch (ex.component) {
    case "Button":
      return <Button variant={v}>{kids}</Button>;
    case "Badge":
      return <Badge variant={v}>{kids}</Badge>;
    case "Alert":
      return <Alert variant={v}>{kids}</Alert>;
    case "Select":
      return (
        <Select defaultValue={text}>
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={text}>{text}</SelectItem>
          </SelectContent>
        </Select>
      );
    default:
      return <code>{ex.component}</code>;
  }
}

function CodePair({ ch }: { ch: Change }) {
  if (!ch.element || ch.existing?.type !== "component") return null;
  const swapped = componentCode({ ...ch.element, choice: `${ch.existing.component}/${ch.existing.variant}` }, loadComponents()).code;
  return (
    <details className="d-details r-code">
      <summary>Show code</summary>
      <p>Existing</p>
      <pre className="d-pre">{swapped}</pre>
      <p>Proposed</p>
      <pre className="d-pre">{ch.element.source}</pre>
    </details>
  );
}

function jevSays(ch: Change): string {
  const el = ch.element;
  if (el && ch.existing?.type === "component") {
    const p = ch.existing.p;
    const name = `${ch.existing.component} ${ch.existing.variant}`;
    const newP = el.probabilities["new_component"] ?? 0;
    if (p >= 0.8) return `This does the same job as ${name} (${pct(p)} match).`;
    if (newP > p) return `No existing component clearly fits. Closest is ${name} (${pct(p)}), new component ${pct(newP)}.`;
    return `Probably ${name} (${pct(p)}), but it's a judgment call.`;
  }
  const c = ch.colors[0];
  const near = c.best ?? c.candidates[0];
  if (!near) return "No token is close in color or role.";
  return `${near.token} is ΔE ${near.deltaE.toFixed(1)} away, ${pct(near.sameRole)} same role.`;
}

function colorNotes(ch: Change) {
  return ch.colors.map((c) => {
    const near = c.best ?? c.candidates[0];
    return (
      <li key={c.id}>
        <span className="r-dot" style={{ background: c.hex }} />
        <code>{c.raw}</code>
        <span>
          {c.property}
          {near ? (
            <>
              {" "}
              · nearest <code>{near.token}</code> ΔE {near.deltaE.toFixed(1)}, {pct(near.sameRole)} same role
            </>
          ) : (
            " · no token nearby"
          )}
        </span>
      </li>
    );
  });
}

function optionsFor(ch: Change): ChoiceOption[] {
  const ex = ch.existing;
  const exName = ex ? (ex.type === "component" ? `<${ex.component}${ex.variant !== "default" ? ` variant="${ex.variant}"` : ""}>` : ex.token) : "";
  const newTokens = ch.keep.filter((k) => k.isNew);
  const dupe = newTokens.find((k) => k.nearest && k.nearest.deltaE < 12);
  const opts: ChoiceOption[] = [];
  if (ex)
    opts.push({
      kind: "existing",
      title: `Use existing ${exName}`,
      detail: "Swap in what the system already has. Fastest path to merge, nothing new to maintain.",
      recommended: ch.recommended === "existing" ? "Recommended" : undefined,
    });
  opts.push({
    kind: "keep",
    title: "Keep my design",
    detail: newTokens.length
      ? `Ships as designed. Adds ${newTokens.map((k) => `${k.name} (${k.value})`).join(", ")} to the system and files a design request.`
      : "Ships as designed, on existing tokens.",
    warning: dupe ? `${dupe.value} is a near-duplicate of ${dupe.nearest!.token} (ΔE ${dupe.nearest!.deltaE.toFixed(1)}). Design review will ask why.` : undefined,
    recommended: ch.recommended === "keep" ? "Recommended" : undefined,
  });
  opts.push({ kind: "oneoff", title: "One-off exception", detail: "Keep it exactly as written, outside the system. Record why." });
  opts.push({ kind: "proposed", title: "Undecided", detail: "Leave the branch as proposed for now." });
  return opts;
}

function ChangeCard({ ch, state, index }: { ch: Change; state: ReviewState; index: number }) {
  const choice = state.choices[ch.id];
  const current: ChoiceKind = choice?.kind ?? "proposed";
  return (
    <article className={`r-card ${current === "proposed" ? "r-card-open" : "r-card-done"}`}>
      <header className="r-card-head">
        <span className="r-num">{index + 1}</span>
        <div>
          <h3>{ch.title}</h3>
          <p className="r-where">
            {ch.file}:{ch.line}
          </p>
        </div>
        <span className={`r-state r-state-${current}`}>{current === "proposed" ? "Needs a decision" : "Decided"}</span>
      </header>
      <div className="r-compare">
        <figure>
          <figcaption>Existing in system</figcaption>
          <div className="r-stage">
            <Existing ch={ch} />
          </div>
        </figure>
        <figure>
          <figcaption>Proposed in branch</figcaption>
          <div className="r-stage r-stage-proposed">
            <Proposed ch={ch} />
          </div>
        </figure>
      </div>
      <CodePair ch={ch} />
      <p className="r-jev">
        <span className="r-jev-mark">Jev</span> {jevSays(ch)}
      </p>
      <ul className="r-colors">{colorNotes(ch)}</ul>
      <ChoiceGroup changeId={ch.id} options={optionsFor(ch)} current={current} currentReason={choice?.reason} locked={!!state.accepted} />
    </article>
  );
}

export function ReviewView() {
  const base = process.env.DRIFT_REVIEW_BASE ?? loadConfig().review.base;
  const info = branchInfo(base);
  const pr = pullRequest();
  const state = readReview();
  const fresh = state && state.branch === info.branch && (state.head === info.head || state.accepted?.sha === info.head);

  if (!info.commits.length && !state?.accepted) {
    return (
      <section className="d-empty-state">
        <h1>No pull request here</h1>
        <p>
          <code>{info.branch}</code> has no commits ahead of <code>{base}</code>. Check out a feature branch, or run <code>npm run demo:branch</code>.
        </p>
      </section>
    );
  }

  const pending = fresh ? pendingCount(state!) : 0;
  const diff = fresh && !state!.accepted ? workingDiff(state!) : "";
  const version = fresh ? JSON.stringify(state!.choices) + (state!.accepted?.sha ?? "") : "none";

  return (
    <div className="r-root">
      <section className="r-pr">
        <div className="r-pr-main">
          <p className="r-branch">
            <code>{info.branch}</code> <span aria-hidden>→</span> <code>{base}</code>
          </p>
          <h1>{info.commits.at(-1)?.subject ?? state?.accepted?.summary[0]}</h1>
          <p className="r-meta">
            {info.commits.length} commit{info.commits.length === 1 ? "" : "s"} by {[...new Set(info.commits.map((c) => c.author))].join(", ")}
            {pr && (
              <>
                {" · "}
                <a href={pr.url} target="_blank" rel="noreferrer">
                  PR #{pr.number} on GitHub
                </a>
              </>
            )}
          </p>
        </div>
        <div className="r-pr-status">
          {!fresh ? (
            <>
              <p className="r-status r-status-idle">Not reviewed yet</p>
              <ActionButton action={buildReviewAction} pendingLabel="Reviewing with Jev…" variant="primary">
                Review changes
              </ActionButton>
            </>
          ) : state!.accepted ? (
            <>
              <p className="r-status r-status-ready">Ready to merge</p>
              <p className="r-status-sub">
                Committed <code>{state!.accepted.sha}</code>
                {state!.accepted.pushed ? " and pushed" : ""}. {state!.after?.flagged ?? 0} new drift flags vs {base}.
                {state!.accepted.pushed && pr && (
                  <>
                    {" "}
                    The Drift check on{" "}
                    <a href={pr.url} target="_blank" rel="noreferrer">
                      PR #{pr.number}
                    </a>{" "}
                    reruns and updates its comment.
                  </>
                )}
                {state!.accepted.pushError && <> Push failed: {state!.accepted.pushError}</>}
              </p>
            </>
          ) : pending ? (
            <>
              <p className="r-status r-status-pending">
                {pending} decision{pending === 1 ? "" : "s"} needed
              </p>
              <p className="r-status-sub">Nothing is blocked. You pick the path for each change.</p>
            </>
          ) : (
            <>
              <p className="r-status r-status-decided">All decided</p>
              <p className="r-status-sub">Check the preview, then accept.</p>
            </>
          )}
        </div>
      </section>

      {fresh && (
        <div className="r-grid">
          <div className="r-changes">
            <p className="r-intro">
              Jev reviewed {state!.stats.literals} new colors and {state!.stats.elements} new elements in {state!.stats.ms} ms and flagged {state!.changes.length}{" "}
              change{state!.changes.length === 1 ? "" : "s"} for a decision.
            </p>
            {state!.changes.map((ch, i) => (
              <ChangeCard key={ch.id} ch={ch} state={state!} index={i} />
            ))}
            {state!.changes.length === 0 && <p className="d-empty">No drift in this branch. It&rsquo;s already on the system.</p>}
          </div>

          <aside className="r-side">
            <div className="r-side-head">
              <h2>{state!.accepted ? "Merged result" : "Live preview"}</h2>
              <p>
                {state!.accepted
                  ? "What lands on main."
                  : "The real app with your choices applied to the working tree. Nothing is committed until you accept."}
              </p>
            </div>
            <PreviewFrame src="/app" version={version} label="Acme Desk with your choices applied" />
            <figure className="r-zoom">
              <figcaption>Where the changes land: the composer, at full size</figcaption>
              <PreviewFrame src="/app" version={version} label="Composer close-up" crop={{ x: 330, y: 600, w: 780, h: 160 }} />
            </figure>

            {!state!.accepted ? (
              <div className="r-accept">
                <ActionButton action={acceptReviewAction} pendingLabel="Committing…" variant="primary" disabled={pending > 0}>
                  {pending ? `Decide ${pending} more to accept` : "Accept and commit"}
                </ActionButton>
                {Object.keys(state!.choices).length > 0 && (
                  <ActionButton action={resetChoicesAction} pendingLabel="Resetting…">
                    Back to as proposed
                  </ActionButton>
                )}
              </div>
            ) : (
              <ul className="r-summary">
                {state!.accepted.summary.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            )}
            {diff && (
              <details className="d-details r-diff-wrap">
                <summary>Code that will be committed</summary>
                <pre className="d-pre r-diff">
                  {diff.split("\n").map((l, i) => (
                    <span key={i} className={l.startsWith("+") && !l.startsWith("+++") ? "d-add" : l.startsWith("-") && !l.startsWith("---") ? "d-del" : undefined}>
                      {l + "\n"}
                    </span>
                  ))}
                </pre>
              </details>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
