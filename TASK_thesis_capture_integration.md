# Thesis Capture Integration -- Task Spec for Claude Code

## Problem

The thesis integrity monitor (Tasks 1-7, now merged) detects conflicts between a user's thesis and the research data. But it has no thesis data to work with. The monitor checks `localStorage` for per-stock thesis objects under `ci_thesis_{TICKER}` and finds nothing. The feature is inert.

This spec wires thesis capture into the three places where users already express views on stocks: the thesis comparator, the analyst chat, and portfolio weights. No new UI for thesis declaration. Capture is implicit from actions the user is already taking.

---

## Architecture

### Thesis Object Schema

```javascript
{
  ticker: 'WOR',                          // ASX ticker
  dominantHypothesis: 'N2',               // which hypothesis the user believes (N1-N4)
  probabilitySplit: [25, 50, 15, 10],     // user's probability assignments to N1-N4
  biasDirection: 'bearish',               // 'bullish' | 'bearish' | 'neutral'
  keyAssumption: 'margin compression from energy transition',  // free text, nullable
  source: 'explicit',                     // 'explicit' | 'inferred'
  confidence: 'high',                     // 'high' | 'low'
  capturedAt: '2026-03-17T10:30:00Z',    // ISO timestamp
  capturedFrom: 'comparator'              // 'comparator' | 'chat' | 'portfolio'
}
```

**Source and confidence rules:**
- `source: 'explicit'` + `confidence: 'high'` -- from thesis comparator (user deliberately entered probabilities)
- `source: 'inferred'` + `confidence: 'high'` -- from repeated consistent chat signals (3+ directional questions same bias)
- `source: 'inferred'` + `confidence: 'low'` -- from a single chat question or portfolio weight alone

**Impact on monitor behaviour** (already implemented in thesis-monitor.js):
- `explicit` thesis triggers `conflict` alerts when mismatched
- `inferred` + `low confidence` thesis triggers `signal` alerts only (never `conflict`)
- `inferred` + `high confidence` thesis triggers `conflict` alerts (promoted via repeated signals)

### localStorage Key

`ci_thesis_{TICKER}` -- one key per stock, value is the JSON thesis object.

Example: `ci_thesis_WOR` stores the WOR thesis.

### Shared Write Function

All three capture points use the same write function in `src/features/thesis-capture.js`.

**Overwrite precedence:** explicit > inferred high > inferred low. A user who deliberately ran the comparator should not have their thesis silently overwritten by a casual chat question.

---

## Status: IMPLEMENTED

All 5 tasks completed in a single session:

- **Task 1**: `src/features/thesis-capture.js` -- core module with `saveThesis`, `getThesis`, `getAllTheses`, `inferBiasFromQuestion`, `getDominantFromSplit`, `inferBiasFromSplit`, `recordSignal`, `getConsistentSignalCount`
- **Task 2**: `src/pages/thesis.js` -- captures explicit thesis after comparator alignment result
- **Task 3**: `src/features/chat.js` -- infers thesis from analyst chat questions with signal promotion
- **Task 4**: `public/js/personalisation.js` -- infers thesis from portfolio weights via `window.ThesisCapture` bridge
- **Task 5**: Wired via `ci:thesis:saved` custom event; `checkForAlerts` updated to scan stored theses + portfolio fallback

16 new tests. 195/195 Vitest passing. Build succeeds.
