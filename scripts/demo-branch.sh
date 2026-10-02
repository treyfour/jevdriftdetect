#!/usr/bin/env bash
# Recreates the demo PR: feature/composer-polish = <base> + two commits from two "teammates":
#   1. an AI coding agent adds a Summarize action (hand-rolled, indigo, inline SVG)
#   2. a designer adds a violet model picker
# Then force-pushes and opens (or refreshes) the GitHub PR. Safe to rerun between rehearsals.
# Usage: npm run demo:branch [base]   (default: origin/main)   DEMO_PUSH=0 to stay local.
set -euo pipefail
BASE="${1:-origin/main}"
BRANCH="feature/composer-polish"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Working tree has uncommitted changes. Commit or discard them first." >&2
  exit 1
fi

[[ "$BASE" == origin/* ]] && git fetch -q origin "${BASE#origin/}"
git switch -q -C "$BRANCH" "$BASE"

cp scripts/fixtures/ThreadHeader.branch.tsx saas/ThreadHeader.tsx
git add saas/ThreadHeader.tsx
git -c user.name="Acme Coding Agent" -c user.email="agent@acme.example" \
  commit -q -m "Add Summarize thread action to the chat header"

cp scripts/fixtures/Composer.branch.tsx saas/Composer.tsx
git add saas/Composer.tsx
git -c user.name="Sam Rivera (Design)" -c user.email="sam@acme.example" \
  commit -q -m "Composer: model picker for Acme Fast"

rm -f .drift/review.json

if [[ "${DEMO_PUSH:-1}" == "1" ]]; then
  git fetch -q --prune origin
  git push -q --force -u origin "$BRANCH"
  # A merged or closed demo PR doesn't count; open a fresh one.
  if [[ "$(gh pr list --head "$BRANCH" --state open --json number --jq length)" == "0" ]]; then
    gh pr create --base "${BASE#origin/}" --head "$BRANCH" \
      --title "Chat: Summarize action and model picker" \
      --body "Adds a Summarize action to the thread header (agent-authored) and a model picker to the composer (design)." >/dev/null
  fi
  echo "Pushed $BRANCH. PR: $(gh pr list --head "$BRANCH" --state open --json url --jq '.[0].url')"
  echo "The Drift check posts its comment in about a minute."
else
  echo "On $BRANCH, two commits ahead of $BASE (not pushed)."
fi
