# Drift: design system drift detector

Finds hardcoded colors and hand-styled elements, explains precisely what's wrong, and routes each one to a resolution. Jev (TypeSafe System One) answers small typed questions about **role**. Code does all extraction, color math (CIE76 ΔE), routing, and edits.

| Lane | Who | What happens |
|---|---|---|
| **Auto-fix** | Engineers | An existing token or component already does this job. One-click swap (`var(--token)` or `<Button variant>`). |
| **Review** | Designers | Related but not clearly the same role. Copy a ready-made question for design. |
| **Propose** | Design system | A real role the system lacks. Add the token in one click, or copy a design request. |
| **Leave** | Nobody | Intentional and outside the system (e.g. a third-party logo color). |

## Setup

```bash
npm install
echo 'JEV_API_KEY=...' > .env.local   # JEVITE_API_KEY also works
npm run drift                         # first scan, writes .drift/report.json
npm run dev                           # http://localhost:3000/drift and /demo
```

## Demo run (about 5 minutes)

1. **The messy app.** Open `/demo`. It looks fine, and that's the problem: 20 hardcoded colors and 5 hand-rolled elements.
2. **The trap.** Open `/drift`. The hero shows brand red `#E5484D` at ΔE 8.1 from `--destructive`. A distance-only linter merges it, so the promo badge turns into an error color. Jev puts it at under 10% same role, so it becomes a new-token proposal instead.
3. **The reverse.** Green `#16a34a` is ΔE 14 from `--success`. That's too far for a distance rule, but Jev puts it at 94% same role, so it gets fixed.
4. **Accuracy.** About 19/20 routed correctly vs the planted answer key, compared with 13/20 by distance alone. Open "Where Jev and the key disagree" to show the honest miss.
5. **Engineer path.** Click **Apply all fixes**. Refresh `/demo`: it looks identical, but now runs on tokens and `<Button>`, `<Badge>`, `<Alert>`.
6. **Designer path.** In Propose, click **Add --promo-badge**. The token lands in `design-system/tokens.json` as a one-line diff, and the badge now uses it. **Copy request** shows the design-request markdown, including the "consider consolidating" note.
7. **The gate.** Run `npm run demo:new-feature`, which drops a teammate's new component in. Open **PR gate** and click **Check this branch**. The result is *Merge blocked*: 4 items already have a system answer, and the new pine green goes to review. Click **Fix 4 and recheck** to get *Mergeable, with design review*.

Reset between rehearsals with `npm run demo:reset`.

## PR gate

`npm run drift:gate -- --base origin/main` judges only lines the branch adds. Existing code is never re-judged, so people can build freely.

- **Blocks** (exit 1): new drift that already has a token or component. Fix with `npm run drift -- --fix`.
- **Warns** (exit 0): net-new values and ambiguous roles. Design requests go into the job summary.

Policy lives in `drift.config.json` (`gate.block`, `gate.warn`). The local default base is `HEAD`, which checks uncommitted work. CI passes the PR's base branch (see `.github/workflows/drift-gate.yml`).

## Known edges

- Jev runs aren't perfectly deterministic. Near-ties (the promo-badge component is ~45/42 between `Badge/default` and a new component) can flip between Review and Propose. Set `DRIFT_REPLAY=1` to replay cached answers for a guaranteed-identical demo.
- Tinted section surfaces (e.g. a mint `#ECFDF5` panel) can be judged "same role" as `--background`. A surface-token tier or a lightness guard in code would fix this.
- Colors only (hex and rgb, including Tailwind arbitrary values). Spacing and type are next.

## Layout

```
design-system/   tokens.json, components.json, answer_key.json (written before any Jev run)
demo/            the messy store with planted drift
lib/drift/       extract → block (ΔE) → decide (Jev) → route → fix / gate
scripts/drift.ts CLI: scan, --fix, --gate
app/drift/       report UI and server actions (local only: they edit the working tree)
```
