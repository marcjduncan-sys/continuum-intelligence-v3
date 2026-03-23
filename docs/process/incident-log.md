# Incident Log

<!-- Record production incidents here. Include: date, symptom, root cause, fix, and prevention rule. -->

## Pre-Flywheel incidents (historical)

### 2026-02 -- Commit 58b2c99: stale index.html push

**Symptom:** Analyst panel, portfolio DOM, dark mode, and comparator all broken simultaneously.
**Root cause:** Pushed `index.html` from a stale local copy. GitHub Actions had committed automated changes to main that were not pulled first.
**Fix:** Reverted the commit manually.
**Prevention rule:** Always `git pull origin main` before editing `index.html`. Added to AGENTS.md rule 7.

### 2026-02 -- WOW scoring divergence (-42 / +25 / -33)

**Symptom:** Same stock showed different skew scores in snapshot card, research tile, and report page.
**Root cause:** Three independent scoring display locations with no single source of truth.
**Fix:** Canonicalised `computeSkewScore` to zero-contribution convention.
**Prevention rule:** Whenever touching scoring/skew logic, check all three display locations. Added to AGENTS.md review checklist.

### 2026-03-08 -- Shadow copy: js/personalisation.js vs public/js/personalisation.js

**Symptom:** Fixes applied to root-level `js/personalisation.js` had no effect in production.
**Root cause:** Vite serves from `public/` via `publicDir`. Root-level `js/personalisation.js` was never copied to `dist/`.
**Fix:** Deleted root-level copy, reconciled 57 divergent lines into `public/js/personalisation.js`.
**Prevention rule:** Before editing any classic-script file, confirm its path resolves under `publicDir`. Added to `tasks/lessons.md`.

### 2026-03-09 -- Railway 502 chain (three consecutive healthcheck failures)

**Symptom:** Railway healthcheck returned 502 after three consecutive deployments.
**Root cause:** `from . import db` in `summarise.py` assumed package context (relative import). Railway runs `main.py` directly, granting bare-module context.
**Fix:** Changed to `import db` matching project convention.
**Prevention rule:** Test imports with `cd api/ && python3 -c "import module"`, not `from api import module`.
