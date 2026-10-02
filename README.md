# Drift: design system drift review

When a branch adds a hardcoded color or a hand-styled element, Drift flags it, shows **what exists in the system** next to **what the branch proposes**, and lets the author pick the path. You see the real result before anything is committed. It flags drift but never hard-blocks: every flag needs *a* decision, not a particular one.

Jev (TypeSafe System One) answers small typed questions about **role** ("is this the same job as `Button default`?"). Code does extraction, color math (CIE76 ΔE), grouping, edits, and git.

| Path | Who it's for | What happens |
|---|---|---|
| **Use existing** | Engineers who want it done | Swap in the system token or component (`<Button>`, `<Select>`, …). |
| **Keep my design** | Designers making a creative call | Ships as designed. New values become tokens, and a design request is filed in `design-system/requests/`. |
| **One-off exception** | Either | Kept exactly as written, with a reason in `design-system/exceptions.json`. |

## Setup

```bash
npm install
echo 'JEV_API_KEY=...' > .env.local   # JEVITE_API_KEY also works
npm run demo:branch                   # creates feature/composer-polish off main
npm run dev                           # http://localhost:3000/drift
```

## Demo run (about 5 minutes)

1. **The existing app.** Open `/app`: Acme Desk, a B2B assistant with a left nav, a chat thread, and a composer, fully on the design system.
2. **A branch arrives.** `feature/composer-polish`, by "Sam (Design)", adds a violet model picker and a hand-rolled Send button to the composer. Open `/drift` and click **Review changes**: Jev checks the branch's new code in about 300 ms.
3. **See it, side by side.** Each change shows *Existing in system* and *Proposed in branch*, both rendered live, plus Jev's read:
   - **Send button:** "same job as Button default (100%)". `#2F6FEB` is ΔE 9.8 from `--primary`. Keeping it would add a near-duplicate, and the card says so.
   - **Model picker:** "same job as Select default", but the designer wants the violet.
4. **Choose, per persona.** Play the engineer: **Use existing `<Button>`**. Play the designer: **Keep my design** on the picker. The live preview and the composer close-up update after each choice. Switch options to compare them in context; nothing is committed yet.
5. **Peek at the code.** Open "Code that will be committed": `var(--accent)`, `<Button variant="default">`, the `tokens.json` line, and the design request asking for a Select variant.
6. **Accept.** One commit with a readable summary. The status reads **Ready to merge**: 0 new drift flags vs main.
7. **Optional: one-off.** Rerun `npm run demo:branch` and pick **One-off exception** with a reason. The gate honors it.

The **Codebase scan** tab is the accuracy story. A messy store (`/demo`) with 20 planted drifts and an answer key gives about 19/20 for Jev vs 13/20 for color distance alone, including the brand-red trap (ΔE 8.1 from `--destructive`, but a different role).

## In CI

`npm run drift:gate -- --base origin/main` judges only the lines a PR adds and honors recorded exceptions. `.github/workflows/drift-gate.yml` runs it on pull requests and posts design requests to the job summary. Policy lives in `drift.config.json`.

## Known edges

- Jev isn't perfectly deterministic. Near-ties can flip between runs. `DRIFT_REPLAY=1` replays cached answers for an identical demo.
- Tinted surfaces (e.g. a mint `#ECFDF5` panel) can be judged "same role" as `--background`. A lightness guard in code would fix it.
- The proposed-element preview renders inline styles exactly. Tailwind-only hand-styling isn't extracted yet. Colors only (hex and rgb, including Tailwind arbitrary values).
- The review's server actions edit and commit the working tree. They're for local use only and are disabled in production.

## Layout

```
saas/                 Acme Desk, the app under review
demo/                 the messy store for the codebase scan
design-system/        tokens, components, answer key, requests/, exceptions.json
lib/drift/            extract → block (ΔE) → decide (Jev) → route; review.ts (PR flow), fix.ts, gate.ts
app/drift/            review + scan UI, server actions
scripts/demo-branch.sh  builds the demo PR from scripts/fixtures/Composer.branch.tsx
```
