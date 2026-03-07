# ADR 003: computeSkewScore neutral hypothesis convention

**Date:** 2026-03-07
**Status:** Adopted
**Files affected:** `src/lib/dom.js`, `js/dne/normalise.js`

---

## Context

`computeSkewScore` computes a directional skew score from normalised ACH hypothesis weights. Each hypothesis carries a direction tag: `upside`, `downside`, or `neutral`/`balanced`. The score is `bull - bear`, where `bull` is the sum of upside weights and `bear` is the sum of downside weights.

A parity audit on 2026-03-07 found that the two active implementations of `computeSkewScore` treated neutral hypotheses differently:

- **Implementation A** (`src/lib/dom.js`, as of audit): neutral weight `W` was split 50/50, adding `W/2` to both bull and bear.
- **Implementation B** (`js/dne/normalise.js`, as of audit): neutral weight `W` contributed zero to both bull and bear.

---

## Mathematical proof of score invariance

The skew score is `score = bull - bear`. For a neutral hypothesis with weight `W`:

- Implementation A: `bull' = bull + W/2`, `bear' = bear + W/2`
  - `score_A = (bull + W/2) - (bear + W/2) = bull - bear = score_B`
- Implementation B: `bull' = bull`, `bear' = bear`
  - `score_B = bull - bear`

The 50/50 split adds equal quantities to both sides, which cancel in the difference. The skew score and direction label (`upside`/`downside`/`balanced`) are identical under both conventions for all inputs.

Validated against all 25 tickers in the coverage universe on 2026-03-07: `scoreDiff = 0` for all affected tickers (MQG, BHP, CSL, DRO, DXS, GMG, MIN, REA, STO).

---

## Decision

Adopt **Implementation B: zero contribution** as the canonical convention in both files.

The neutral-handling block in both `computeSkewScore` implementations now reads:

```js
} else {
  // Neutral hypotheses contribute zero directional weight.
  // Bull+bear represents genuine directional conviction only.
  // Convention adopted 2026-03-07 -- see docs/decisions/
}
```

---

## Rationale

**Interpretability of bull and bear as displayed values.** While the score is invariant, the absolute `bull` and `bear` values are not. If either value is ever displayed in the UI (e.g., as a conviction percentage or probability dial), the 50/50 convention inflates both symmetrically and produces bull+bear > 100% when neutral hypotheses are present. The zero-contribution convention preserves the semantics that `bull` and `bear` represent only genuine directional conviction: the analyst assigned these hypotheses a neutral direction because they make no directional claim, and that intent is respected by contributing nothing.

**Alignment with author intent.** A neutral direction tag means the analyst explicitly declined to assign directional conviction to a hypothesis. Splitting its weight 50/50 overrides that intent. Zero contribution honours it.

**Consistency across implementations.** The zero-contribution convention was already in `js/dne/normalise.js` (the backend-facing file). Making `src/lib/dom.js` match it eliminates the divergence rather than propagating the 50/50 approach to the backend.

---

## Rejected alternative

**50/50 split (Implementation A):** Treats neutral as "could go either way" and distributes weight equally. Preserves the score (as proved above) but produces misleading absolute bull/bear values and violates analyst intent. Rejected.

---

## Impact

- Skew scores and direction labels: no change for any ticker.
- Absolute bull/bear display values: will change for the 9 tickers that have neutral hypotheses (MQG, BHP, CSL, DRO, DXS, GMG, MIN, REA, STO). Both values decrease by equal amounts; the displayed conviction percentages will be lower and will not sum to 100%, which is correct when neutral hypotheses are present.
- `previousSkew` pipeline (`api/refresh.py`): not affected. The Python implementation mirrors `js/dne/normalise.js` which already used zero-contribution.
