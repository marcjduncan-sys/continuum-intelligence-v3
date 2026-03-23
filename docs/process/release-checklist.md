# Release Checklist

Before merging any bead to main:

## Pre-merge

- [ ] PLAN.md updated with current plan details
- [ ] Bead packet acceptance criteria all met
- [ ] `npm run validate` passes (lint + Vitest + Jest)
- [ ] `cd api && python -m pytest` passes
- [ ] No regressions in existing functionality
- [ ] Fresh-context reviewer has signed off
- [ ] DECISIONS.md updated if any architectural choice was made
- [ ] No hardcoded secrets in the diff
- [ ] `git pull origin main` run immediately before merge

## Post-merge

- [ ] GitHub Actions runs clean (check within 5 minutes)
- [ ] `curl https://ci-api.fly.dev/api/health` returns 200
- [ ] Load `https://app.continuumintelligence.ai` -- home page renders correctly
- [ ] Smoke test the specific feature/fix that was shipped
- [ ] Update CLAUDE.md Current State section if the change is significant
