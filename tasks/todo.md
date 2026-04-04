# Task Tracker

<!-- Claude: update this file as you work. Check items off, add review notes, track blockers. -->

## Current Task

**Stock Detail Page -- Visual Remediation (15 issues vs. prototype 02-stock-detail.html)**

Branch: `redesign/phase5-cleanup`
Prototype: `docs/prototypes/02-stock-detail.html`
Acceptance: Live `#report-BHP` visually matches prototype in structure and styling.

---

## Wave Plan (AWAITING USER APPROVAL)

### Wave 1A -- CSS quick wins (stock-detail.css only, no JS)
- [ ] Issue 3: ACH card header backgrounds -- change dark gradients to light tints (4 lines at css:862-865) + update text colours for readability on light backgrounds
- [ ] Issues 11-12: CSS hide for `.stock-nav-arrows` and `.sections-float-toggle`
- [ ] Issue 4: Verify/fix `.ach-evidence` grid columns and `.ach-ev-col` padding

### Wave 1B -- hero.js data fixes
- [ ] Issue 8: Market cap -- prefer pre-formatted `heroMetrics[0].value` over raw `data.marketCap` integer
- [ ] Issue 9: Confidence -- compute from `data.skew.score` or normalised hypothesis weights instead of hardcoded "TBC"
- [ ] Issue 14: 52w range -- format as `A$low -- A$high` using en-dash
- [ ] Issue 15: Price targets -- format with 2 decimal places

### Wave 2A -- JS logic fixes
- [ ] Issue 6: risk-register.js -- fix data field names: `tripwires.items` → `tripwires.cards`, `gaps.items` → `gaps.coverageRows`
- [ ] Issue 10: Chat context chips -- investigate why `.cp-context-bar` renders vertically despite correct CSS; fix override

### Wave 2B -- Requires investigation / discussion
- [ ] Issue 1: Home content visible above stock detail -- inspect index.html for content outside `.page` containers (router and CSS show/hide are correct)
- [ ] Issue 2: Topbar context-awareness -- significant feature change (home controls vs. stock breadcrumb + nav buttons)
- [ ] Issue 5: Domain scores vs. source types -- DATA MODEL ISSUE: `evidence.cards` contains source type labels ("Corporate Communications") not domain labels ("Operational Performance"). Renderer is correct. Data pipeline change needed or design decision required.
- [ ] Issue 13: Capability strip completeness -- verify index.html strip items against prototype

### Wave 3 -- Final verification
- [ ] Run `npm run test:unit` -- must hold at 1029 passing
- [ ] Run `npm run build` -- must compile clean
- [ ] Visual QA: compare live `#report-BHP` against prototype in parallel browser tabs

---

## Root Cause Summary (pre-implementation findings)

| # | File | Root Cause |
|---|------|------------|
| 3 | stock-detail.css:862-865 | `.ach-case.bull/base/bear/swing .ach-case-head` gradients are dark (#2d6a4f etc.); prototype requires light (#edf7f1 etc.) |
| 6 | risk-register.js:14,36 | Looks for `tripwires.items` (missing); data has `tripwires.cards` (8 items). Same for gaps. |
| 8 | hero.js:104 | `data.marketCap` (raw int: 268129566720) takes priority over `heroMetrics[0].value` (formatted: 'A$253B') |
| 9 | hero.js:86 | Confidence hardcoded as `TBC` |
| 5 | evidence-domains.js | Renderer correct; data wrong -- `evidence.cards` holds source types not domain scores |
| 7 | hero.js:74, stock-detail.css:219 | Both are correct -- `.highlight` applied to cell 2, CSS has dark gradient. May not be an actual issue. |
| 10 | stock-detail.css:479 | `.cp-context-bar` base CSS is `display:flex` (horizontal) -- override somewhere else |
| 1 | index.html (not checked) | Router and base.css page show/hide are correct; issue must be in HTML structure |

---

## Do Not Fix (unrelated findings)
_none yet_

---

## Review
_populated after implementation_
