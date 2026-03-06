# Checklist: Phase 2 Cutover

<!-- Owner: fill in the specific scope of "Phase 2" before using this checklist.
     This template is structured for a feature cutover that involves replacing
     or promoting a parallel implementation into production. -->

**Phase 2 scope:** _[describe what is being cut over]_
**Target date:** _[date]_
**Rollback plan:** `git revert <commit-range>` and push to main

---

## Pre-cutover (complete before starting)

- [ ] All Vitest tests pass: `npm run test:unit`
- [ ] All Jest tests pass: `npm run test`
- [ ] `npm run build` succeeds locally with no warnings
- [ ] `git pull origin main` -- local is current with remote
- [ ] Feature branch is up to date with `main` (rebased or merged)
- [ ] Railway health check passes: `curl .../api/health`
- [ ] Identify any GitHub Actions workflows that will run during the cutover window and confirm they will not conflict

---

## Cutover steps

- [ ] Tag the current working state: `git tag working-pre-phase2`
- [ ] _[list specific implementation steps here]_
- [ ] Commit each logical step separately (not one large commit)
- [ ] After each commit: `npm run test:unit` passes

---

## Post-cutover verification

- [ ] `npm run build` succeeds
- [ ] `npm run test:unit` passes
- [ ] `npm run test` passes (or known Jest failures are documented)
- [ ] Navigate to each page in the dev server and confirm no console errors:
  - [ ] `#home`
  - [ ] `#report-[any ticker]`
  - [ ] `#portfolio`
  - [ ] `#deep-research`
  - [ ] `#comparator`
  - [ ] `#personalisation`
  - [ ] `#about`
- [ ] Analyst panel opens and returns a response
- [ ] "+ Add Stock" flow completes without error (or known Railway latency is acceptable)
- [ ] Push to `main` and confirm GitHub Pages deploy succeeds
- [ ] Smoke-test production URL after deploy

---

## Rollback criteria

Rollback immediately if:
- Any page throws an unhandled JS error in production
- The analyst panel is missing from the DOM
- Portfolio page fails to render positions
- `npm run test:unit` fails after merge to main

To rollback:
```bash
git revert <range>   # do not git reset --hard on main
git push origin main
```

---

## Notes

_[add phase-specific notes here]_
