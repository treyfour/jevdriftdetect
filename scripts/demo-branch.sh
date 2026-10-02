#!/usr/bin/env bash
# Recreates the demo PR: feature/composer-polish = <base> + a teammate's composer polish.
# Safe to rerun; it resets only the demo branch. Usage: npm run demo:branch [base]
set -euo pipefail
BASE="${1:-main}"
BRANCH="feature/composer-polish"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Working tree has uncommitted changes. Commit or run 'npm run demo:review-reset' first." >&2
  exit 1
fi

git switch -C "$BRANCH" "$BASE" >/dev/null
cp scripts/fixtures/Composer.branch.tsx saas/Composer.tsx
git add saas/Composer.tsx
git -c user.name="Sam Rivera (Design)" -c user.email="sam@acme.example" \
  commit -q -m "Polish chat composer: model picker and send button"
rm -f .drift/review.json
echo "On $BRANCH, one commit ahead of $BASE. Open /drift to review."
