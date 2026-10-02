import Link from "next/link";
import { connection } from "next/server";
import { loadTokens } from "@/lib/drift/designSystem";
import { designRequest } from "@/lib/drift/resolve";
import { readReport } from "@/lib/drift/scan";
import type { ColorFinding, ComponentFinding, Lane, Report, Token } from "@/lib/drift/types";
import {
  acceptProposalAction,
  applyAllAction,
  applyComponentAction,
  applyTokenAction,
  runScanAction,
} from "./actions";
import { ActionButton, CopyButton } from "./buttons";
import { ReviewView } from "./review-view";

const JUDGMENT_LANES: { lane: Lane; title: string; who: string; meaning: string }[] = [
  { lane: "review", title: "Review", who: "Designers", meaning: "Related to the system, but the role isn't clear. A person decides." },
  { lane: "propose", title: "Propose", who: "Design system", meaning: "A real role the system doesn't cover yet. Request it, or add it here." },
  { lane: "leave", title: "Leave", who: "No action", meaning: "Intentional and outside the system. Keep as written." },
];

const pct = (n: number) => `${Math.round(n * 100)}%`;
const tokenValue = (tokens: Token[], name?: string) => tokens.find((t) => t.name === name)?.value;
const tokenUsage = (tokens: Token[], name?: string) => tokens.find((t) => t.name === name)?.usage ?? "";
const variantTag = (choice: string) => {
  const [name, variant] = choice.split("/");
  return `<${name} variant="${variant}">`;
};

function Chip({ left, right, size = "sm", solid }: { left: string; right?: string; size?: "sm" | "md" | "lg"; solid?: boolean }) {
  return (
    <div className={`d-chip d-chip-${size}`} aria-hidden>
      <span style={{ background: left }} />
      {!solid && (right ? <span style={{ background: right }} /> : <span className="d-chip-empty" />)}
    </div>
  );
}

function Diff({ before, after }: { before: string; after: string }) {
  return (
    <pre className="d-diff">
      <span className="d-del">- {before}</span>
      {"\n"}
      <span className="d-add">+ {after}</span>
    </pre>
  );
}

function KeyMark({ ok, expected }: { ok: boolean; expected: string }) {
  return (
    <span className={`d-key ${ok ? "d-key-ok" : "d-key-miss"}`} title={`Answer key: ${expected}`}>
      {ok ? "Matches key" : `Key: ${expected}`}
    </span>
  );
}

const colorOk = (f: ColorFinding) =>
  f.expected ? f.lane === f.expected.lane && (f.lane !== "autofix" || f.best?.token === f.expected.token) : null;
const componentOk = (f: ComponentFinding) =>
  f.expected ? f.lane === f.expected.lane && (f.lane !== "autofix" || f.choice === f.expected.component) : null;

/* ---------- Auto-fix: a changeset, not a pile of cards ---------- */

function ColorFixRow({ f, report }: { f: ColorFinding; report: Report }) {
  const owner = f.subsumedBy ? report.components.find((c) => c.id === f.subsumedBy) : undefined;
  const ok = colorOk(f);
  return (
    <li className="d-row">
      <Chip left={f.hex} right={f.best!.tokenValue} />
      <div className="d-row-main">
        <p className="d-row-change">
          <code className="d-lit">{f.raw}</code>
          <span className="d-arrow" aria-label="becomes">
            ⟶
          </span>
          <code className="d-to">var({f.best!.token})</code>
        </p>
        <p className="d-where">
          <span>
            {f.file}:{f.line}
          </span>
          <span>{f.selector || f.component}</span>
          <span>{f.property}</span>
        </p>
      </div>
      <p className="d-row-why">
        {pct(f.best!.sameRole)} same role
        <span>ΔE {f.best!.deltaE.toFixed(1)}</span>
      </p>
      <div className="d-row-act">
        {owner ? (
          <span className="d-note">via {variantTag(owner.choice)}</span>
        ) : (
          <>
            {f.fix && (
              <details className="d-details">
                <summary>Diff</summary>
                <Diff before={f.fix.before} after={f.fix.after} />
              </details>
            )}
            <ActionButton action={applyTokenAction.bind(null, f.id, f.best!.token)} pendingLabel="Swapping…">
              Swap
            </ActionButton>
          </>
        )}
        {f.expected && <KeyMark ok={!!ok} expected={`${f.expected.lane} ${f.expected.token ?? ""}`} />}
      </div>
    </li>
  );
}

function ComponentFixRow({ f }: { f: ComponentFinding }) {
  const ok = componentOk(f);
  return (
    <li className="d-row d-row-component">
      <div className="d-row-main">
        <p className="d-row-change">
          <code className="d-lit">
            &lt;{f.tag} className=&quot;{f.className}&quot;&gt;
          </code>
          <span className="d-arrow" aria-label="becomes">
            ⟶
          </span>
          <code className="d-to">{variantTag(f.choice)}</code>
        </p>
        <p className="d-where">
          <span>
            {f.file}:{f.line}
          </span>
          <span>&ldquo;{f.text}&rdquo;</span>
        </p>
      </div>
      <p className="d-row-why">{pct(f.probabilities[f.choice] ?? 0)} match</p>
      <div className="d-row-act">
        {f.fix && (
          <details className="d-details">
            <summary>Diff</summary>
            <Diff before={f.fix.before} after={f.fix.after} />
          </details>
        )}
        <ActionButton action={applyComponentAction.bind(null, f.id)} pendingLabel="Swapping…">
          Swap
        </ActionButton>
        {f.expected && <KeyMark ok={!!ok} expected={`${f.expected.lane} ${f.expected.component ?? ""}`} />}
      </div>
    </li>
  );
}

/* ---------- Judgment lanes: cards with evidence ---------- */

function ColorCard({ f, report, tokens }: { f: ColorFinding; report: Report; tokens: Token[] }) {
  const near = f.best ?? f.candidates[0];
  const ok = colorOk(f);
  return (
    <article className="d-card">
      <div className="d-card-top">
        <Chip left={f.hex} right={f.lane === "propose" ? undefined : tokenValue(tokens, near?.token)} />
        <div className="d-card-title">
          <code className="d-lit">{f.raw}</code>
          {f.lane === "review" && near && <code className="d-to-review">{near.token}?</code>}
          {f.lane === "propose" && f.proposal && <code className="d-to-new">+ {f.proposal.name}</code>}
        </div>
      </div>
      <p className="d-where">
        <span>
          {f.file}:{f.line}
        </span>
        <span>{f.selector || f.component}</span>
        <span>{f.property}</span>
      </p>
      {f.lane === "review" && near && (
        <p className="d-verdict">
          Related to <code>{near.token}</code> ({tokenUsage(tokens, near.token)}) but not clearly the same job: {pct(near.sameRole)} same role.
          Might deserve its own token.
        </p>
      )}
      {f.lane === "propose" && f.proposal && (
        <p className="d-verdict">
          {near ? (
            <>
              Nearest token <code>{near.token}</code> does a different job ({pct(near.sameRole)} same role).{" "}
            </>
          ) : (
            "No token is close. "
          )}
          Reads as a role the system should own: {f.proposal.usage.split(" (")[0]} ({pct(f.proposal.gap)}).
        </p>
      )}
      {f.lane === "leave" && (
        <p className="d-verdict">
          {near ? (
            <>
              Not <code>{near.token}</code>&rsquo;s job ({pct(near.sameRole)} same role), and not a role the system should own ({pct(f.gap ?? 0)}).
            </>
          ) : (
            "Nothing in the system is close, and it isn't a recurring role."
          )}
        </p>
      )}
      <div className="d-actions">
        {f.lane === "review" && near && (
          <>
            <ActionButton action={applyTokenAction.bind(null, f.id, near.token)} pendingLabel="Swapping…">
              Use {near.token}
            </ActionButton>
            <CopyButton
              label="Copy question"
              text={`Is \`${f.raw}\` at ${f.file}:${f.line} (${f.selector}, ${f.property}) a variant of \`${near.token}\` or its own token? Jev: ${pct(near.sameRole)} same role, ΔE ${near.deltaE.toFixed(1)}.`}
            />
          </>
        )}
        {f.lane === "propose" && f.proposal && (
          <>
            <ActionButton action={acceptProposalAction.bind(null, f.proposal.name)} pendingLabel="Adding…">
              Add {f.proposal.name}
            </ActionButton>
            <CopyButton label="Copy request" text={designRequest(report, f)} />
          </>
        )}
        {f.expected && <KeyMark ok={!!ok} expected={`${f.expected.lane} ${f.expected.token ?? ""}`} />}
      </div>
    </article>
  );
}

function ComponentCard({ f, report }: { f: ComponentFinding; report: Report }) {
  const ranked = Object.entries(f.probabilities)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  const ok = componentOk(f);
  const isVariant = f.choice.includes("/");
  return (
    <article className="d-card">
      <code className="d-lit">
        &lt;{f.tag} className=&quot;{f.className}&quot;&gt;
      </code>
      <p className="d-where">
        <span>
          {f.file}:{f.line}
        </span>
        <span>&ldquo;{f.text}&rdquo;</span>
      </p>
      <ol className="d-odds" aria-label="Jev's component match">
        {ranked.map(([k, p]) => (
          <li key={k}>
            <span className="d-odds-bar" style={{ width: pct(p) }} />
            <span className="d-odds-label">{k.replaceAll("_", " ")}</span>
            <span className="d-odds-p">{pct(p)}</span>
          </li>
        ))}
      </ol>
      <div className="d-actions">
        {f.lane === "review" && isVariant && (
          <ActionButton action={applyComponentAction.bind(null, f.id)} pendingLabel="Swapping…">
            Use {f.choice.replace("/", " ")}
          </ActionButton>
        )}
        {f.lane === "review" && (
          <CopyButton
            label="Copy question"
            text={`Should <${f.tag} class="${f.className}">${f.text}</${f.tag}> in ${f.file}:${f.line} use ${f.choice}, or does it need a new variant? Jev: ${ranked.map(([k, p]) => `${k} ${pct(p)}`).join(", ")}.`}
          />
        )}
        {f.lane === "propose" && <CopyButton label="Copy component request" text={designRequest(report, f)} />}
        {f.expected && <KeyMark ok={!!ok} expected={`${f.expected.lane} ${f.expected.component ?? ""}`} />}
      </div>
    </article>
  );
}

function JudgmentLanes<T extends { id: string; lane: Lane }>({ items, render }: { items: T[]; render: (t: T) => React.ReactNode }) {
  return (
    <div className="d-lanes">
      {JUDGMENT_LANES.map((l) => {
        const inLane = items.filter((i) => i.lane === l.lane);
        return (
          <section key={l.lane} className={`d-lane d-lane-${l.lane}`} aria-label={`${l.title}, ${inLane.length}`}>
            <header>
              <h3>
                {l.title} <span className="d-count">{inLane.length}</span>
              </h3>
              <p>
                <strong>{l.who}.</strong> {l.meaning}
              </p>
            </header>
            {inLane.length ? inLane.map(render) : <p className="d-empty">Nothing here.</p>}
          </section>
        );
      })}
    </div>
  );
}

/* ---------- Hero ---------- */

function Hero({ report, tokens }: { report: Report; tokens: Token[] }) {
  const close = report.colors.find((c) => c.baselineLane === "autofix" && c.lane !== "autofix" && c.candidates[0]);
  const far = report.colors.find((c) => c.baselineLane !== "autofix" && c.lane === "autofix" && c.best && c.best.deltaE >= 10);
  const a = report.accuracy;
  const misses = report.colors.filter((c) => c.expected && !colorOk(c));
  if (!close && !far && !a) return null;
  return (
    <section className="d-hero">
      {close ? (
        <div className="d-hero-main">
          <h1>Close in color. Different in role.</h1>
          <div className="d-hero-proof">
            <figure>
              <Chip left={close.hex} size="lg" solid />
              <figcaption>
                <code>{close.raw}</code>
                <span>on {close.selector}</span>
              </figcaption>
            </figure>
            <div className="d-hero-delta">
              <span className="d-hero-de">ΔE {close.candidates[0].deltaE.toFixed(1)}</span>
              <span>nearly identical</span>
            </div>
            <figure>
              <Chip left={tokenValue(tokens, close.candidates[0].token)!} size="lg" solid />
              <figcaption>
                <code>{close.candidates[0].token}</code>
                <span>for {tokenUsage(tokens, close.candidates[0].token)}</span>
              </figcaption>
            </figure>
          </div>
          <dl className="d-hero-calls">
            <div className="d-call d-call-wrong">
              <dt>Distance-only linter</dt>
              <dd>Merges it into {close.candidates[0].token}. The promo badge now reads as an error.</dd>
            </div>
            <div className="d-call d-call-right">
              <dt>With Jev</dt>
              <dd>
                {pct(close.candidates[0].sameRole)} same role, so it stays separate.{" "}
                {close.proposal ? (
                  <>
                    Proposed as a new token, <code>{close.proposal.name}</code>.
                  </>
                ) : (
                  "Left as written."
                )}
              </dd>
            </div>
          </dl>
        </div>
      ) : (
        <div className="d-hero-main">
          <h1>No look-alike traps left.</h1>
          <p className="d-hero-sub">Every remaining literal is either on a token or deliberately outside the system.</p>
        </div>
      )}
      <div className="d-hero-side">
        {a && a.jev.total > 0 && (
          <div className="d-side-card">
            <h2>Against the planted answer key</h2>
            <div className="d-score">
              <div>
                <span className="d-score-n">
                  {a.jev.correct}/{a.jev.total}
                </span>
                <span>colors routed right by Jev</span>
              </div>
              <div className="d-score-dim">
                <span className="d-score-n">
                  {a.baseline.correct}/{a.baseline.total}
                </span>
                <span>by color distance alone</span>
              </div>
            </div>
            {misses.length > 0 && (
              <details className="d-details">
                <summary>Where Jev and the key disagree</summary>
                <ul className="d-misses">
                  {misses.map((m) => (
                    <li key={m.id}>
                      <code>{m.raw}</code> ({m.selector}): key says {m.expected!.lane}, Jev chose {m.lane}
                      {m.proposal ? ` as ${m.proposal.name}` : ""}.
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
        {far && far.best && (
          <div className="d-side-card">
            <h2>And the reverse: far in color, same role.</h2>
            <div className="d-side-proof">
              <Chip left={far.hex} right={far.best.tokenValue} size="md" />
              <p>
                <code>{far.raw}</code> on <code>{far.selector}</code> is ΔE {far.best.deltaE.toFixed(1)} from <code>{far.best.token}</code>. Too far for
                a distance rule. Jev: {pct(far.best.sameRole)} same role, so it gets fixed.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/* ---------- Views ---------- */

function ScanView({ report, tokens }: { report: Report; tokens: Token[] }) {
  const s = report.stats;
  const colorFixes = report.colors.filter((c) => c.lane === "autofix");
  const componentFixes = report.components.filter((c) => c.lane === "autofix");
  const edits = colorFixes.filter((c) => !c.subsumedBy).length + componentFixes.length;
  return (
    <>
      <Hero report={report} tokens={tokens} />
      <p className="d-run">
        Checked <strong>{s.literals} hardcoded colors</strong> and <strong>{s.elements} hand-styled elements</strong> against {tokens.length} tokens and 3
        components: {s.calls} Jev calls in <strong>{s.ms} ms</strong> for <strong>${s.costUsd.toFixed(4)}</strong>
        {s.replayed ? `, ${s.replayed} replayed from cache` : ""}.
      </p>

      <section className="d-fixes" aria-labelledby="fixes-title">
        <header className="d-fixes-head">
          <div>
            <h2 id="fixes-title">
              Auto-fix <span className="d-count">{colorFixes.length + componentFixes.length}</span>
            </h2>
            <p>
              <strong>Engineers.</strong> An existing token or component already does this job. Stay on the rails.
            </p>
          </div>
          {edits > 0 && (
            <ActionButton action={applyAllAction} pendingLabel="Applying…" variant="primary">
              Apply all {edits} fixes
            </ActionButton>
          )}
        </header>
        {componentFixes.length > 0 && (
          <>
            <h3 className="d-fixes-sub">Components</h3>
            <ul className="d-rows">
              {componentFixes.map((f) => (
                <ComponentFixRow key={f.id} f={f} />
              ))}
            </ul>
          </>
        )}
        {colorFixes.length > 0 && (
          <>
            <h3 className="d-fixes-sub">Tokens</h3>
            <ul className="d-rows">
              {colorFixes.map((f) => (
                <ColorFixRow key={f.id} f={f} report={report} />
              ))}
            </ul>
          </>
        )}
        {!colorFixes.length && !componentFixes.length && <p className="d-empty">Nothing to fix. Everything that has a system answer uses it.</p>}
      </section>

      <h2 className="d-judgment-title">Needs a decision: colors</h2>
      <JudgmentLanes items={report.colors} render={(f) => <ColorCard key={f.id} f={f} report={report} tokens={tokens} />} />
      <h2 className="d-judgment-title">Needs a decision: components</h2>
      <JudgmentLanes items={report.components} render={(f) => <ComponentCard key={f.id} f={f} report={report} />} />
    </>
  );
}


export default async function DriftPage({ searchParams }: PageProps<"/drift">) {
  await connection();
  const view = (await searchParams).view === "scan" ? "scan" : "review";
  const report = readReport();
  const tokens = loadTokens();

  return (
    <div className="d-root">
      <nav className="d-bar" aria-label="Drift">
        <span className="d-mark">Drift</span>
        <div className="d-tabs">
          <Link href="/drift" aria-current={view === "review" ? "page" : undefined}>
            Pull request
          </Link>
          <Link href="/drift?view=scan" aria-current={view === "scan" ? "page" : undefined}>
            Codebase scan
          </Link>
        </div>
        <div className="d-bar-end">
          <a href={view === "scan" ? "/demo" : "/app"} target="_blank" rel="noreferrer">
            {view === "scan" ? "Open the store" : "Open the app"}
          </a>
          {view === "scan" && (
            <ActionButton action={runScanAction} pendingLabel="Scanning…">
              Rescan
            </ActionButton>
          )}
        </div>
      </nav>
      <main className="d-main">
        {view === "review" ? (
          <ReviewView />
        ) : report ? (
          <ScanView report={report} tokens={tokens} />
        ) : (
          <section className="d-empty-state">
            <h1>No scan yet</h1>
            <p>Scan the codebase for hardcoded colors and hand-styled elements.</p>
            <ActionButton action={runScanAction} pendingLabel="Scanning…" variant="primary">
              Scan the codebase
            </ActionButton>
          </section>
        )}
      </main>
    </div>
  );
}
