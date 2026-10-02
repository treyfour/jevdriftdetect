# Drift: design system review for every PR

Lots of people, and lots of AI agents, commit UI. Most of it quietly skips the design system: a hand-rolled `<button>` with `bg-[#6366f1]`, an inline SVG instead of a Lucide icon, a "close enough" blue. Drift catches that drift on every pull request, shows **what exists in the system** next to **what the PR proposes**, and lets the author choose. Nothing is hard-blocked; every flag just needs *a* decision.

Acme Desk, the demo app, is built on **shadcn/ui with Base UI primitives** and **Lucide** icons. Colors are CSS variables generated from `design-system/tokens.json`.

## How it runs in the pipeline

```
PR opened / pushed  (person or AI agent)
  └─ GitHub Action: Drift
       ├─ diff vs base → extract new colors + hand-styled elements (code)
       ├─ Jev judges role: "same job as Button outline?" "which Lucide icon?" (~400 ms)
       ├─ one sticky PR comment: what's new, Jev's read, [Review and decide in Drift →]
       └─ soft status "Drift / design decisions": pending, never failing
  Author opens Drift
       ├─ existing vs proposed, rendered live, side by side
       ├─ per change: Use existing · Keep my design · One-off (with reason)
       ├─ every choice applied for real; live app preview + close-ups
       └─ Accept → commit pushed to the PR branch
  Action reruns → same comment flips to ✅ with the decisions; status → success
  "Keep my design" → new tokens + design-system/requests/*.md for the DS team
```

| Path | Who it's for | Result |
|---|---|---|
| **Use existing** | Engineers who want it done | Swapped to real shadcn code, e.g. `<Button variant="outline" size="sm"><SparklesIcon />Summarize</Button>` |
| **Keep my design** | Designers making a creative call | Ships as drawn; values become tokens; a design request is filed |
| **One-off exception** | Either | Kept as written; reason recorded in `design-system/exceptions.json` |

## Run the demo

```bash
npm install
echo 'JEV_API_KEY=...' > .env.local
npm run demo:branch      # builds feature/composer-polish: an agent commit + a designer commit; pushes; opens the PR
npm run dev              # http://localhost:3000/drift  (the PR comment links here)
```

1. **The existing app.** `/app` is Acme Desk on `main`: a left nav, a chat thread, and a composer, all shadcn and Lucide.
2. **The PR.** Two commits: *Acme Coding Agent* adds a Summarize button (indigo `bg-[#6366f1]`, hand-drawn SVG); *Sam (Design)* adds a violet model picker. On GitHub the Drift comment reads "2 design decisions needed", and the check is pending, not red.
3. **Review in Drift.** Click the link. Each change shows the system version next to the PR's version, with Jev's read: "same job as Button outline (80%), Lucide has `SparklesIcon`", and "same job as Select (96%)".
4. **Choose.** As the engineer, pick **Use existing** on Summarize. As the designer, pick **Keep my design** on the picker. Watch the app preview and the header and composer close-ups update. Open **Show code** or **Code that will be committed** for the engineers in the room.
5. **Accept.** It commits and pushes. Within about a minute, the PR comment flips to ✅ with both decisions, and the check goes green.

Rerun `npm run demo:branch` to reset the PR for another take. The **Codebase scan** tab is the accuracy story: a messy store with 20 planted drifts gives about 19/20 for Jev vs 13/20 for color distance alone.

## Setup in a real repo

- Add the `JEV_API_KEY` secret. Optionally set a `DRIFT_URL` repo variable pointing at a hosted Drift. It defaults to `http://localhost:3000/drift`.
- `.github/workflows/drift-gate.yml` needs `pull-requests: write` and `statuses: write`.
- To make decisions required before merge, mark **Drift / design decisions** as a required check. It's only pending, never failing, so nothing else gets in the way.
- `npm run drift:gate` is the stricter CLI variant: it exits 1 when new drift already has a system answer.

## Known edges

- Jev isn't perfectly deterministic. Near-ties can flip between runs. `DRIFT_REPLAY=1` replays cached answers.
- Elements are detected when their inline styles or Tailwind arbitrary values carry a hardcoded color. Nested markup beyond one icon isn't swapped yet.
- Review actions edit, commit, and push the local working tree. They're for local use and disabled in production.

## Layout

```
saas/                 Acme Desk (shadcn/ui + Base UI + Lucide)
components/ui/        shadcn components, extended with success/warning variants
design-system/        tokens.json, components.json (usage + code templates), requests/, exceptions.json
lib/drift/            extract → ΔE block → Jev decide → route; review.ts (PR flow), pr.ts (comment + status), fix.ts
app/drift/            review + scan UI
scripts/              drift CLI, demo-branch.sh, fixtures for the demo PR
```
