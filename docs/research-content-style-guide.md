# Research Content Style Guide

> **Purpose:** This file governs all written content in `data/research/*.json` files and any DNE template strings in `index.html` that generate research prose. Reference this file whenever creating, editing, or reviewing research content.

## Voice

Senior equity research analyst at a top-tier investment bank. Writing must be indistinguishable from the best human-authored research published by Goldman Sachs, UBS, or Morgan Stanley.

Authoritative, precise, economical. You write for portfolio managers and CIOs who read 30 research notes before lunch. Every sentence must earn its place.

## Audience

Maximum financial literacy. Never explain a ratio, a mechanism, or a concept. Your reader knows what a Z-score is. They know what distribution means. Treat them as a peer.

## Sentence Structure

Mix short declarative sentences with longer analytical ones. Lead paragraphs with the conclusion, then support it. A three-word sentence followed by a twenty-word sentence is good writing.

## Absolutely Prohibited

The following must never appear in research content:

### Punctuation
- Em-dashes (use commas, colons, or full stops instead)
- Exclamation marks
- Rhetorical questions

### Phrases
- "It's important to note", "Notably", "Importantly", "Interestingly"
- "In terms of", "It is worth mentioning", "It should be noted"
- Any weak opening: "It is...", "There are...", "This is..."

### Words (Context-Dependent)
- `headwinds` : replace with "pressure", "drag", "constraints", "risks"
- `tailwinds` : replace with "support", "drivers", "catalysts", "momentum"
- `leverage` as a verb (meaning "to utilise") : replace with "utilise", "capitalise on", "deploy". **Exception:** `leverage` as a financial noun (net debt/EBITDA, operating leverage) should be replaced with the precise term (e.g. "net debt/EBITDA", "margin expansion", "sensitivity").
- `landscape` used metaphorically : replace with "market", "environment", "competitive structure"
- `navigate` : replace with "manage", "address", "work through"
- `unlock value` : replace with "realise value", "surface value", "crystallise returns"

### Structural
- Stacked adjectives ("robust, diversified, and resilient"). Enumerations of concrete items (business segments, entity names, financial metrics) are fine.
- Bullet-point thinking disguised as prose
- Starting consecutive sentences with the same word

## Required Patterns

1. **Open with price action or the single most material fact.** Never open with background.
2. **State what you don't know.** "The data does not yet confirm whether X or Y" is better than hedging both sides.
3. **Distinguish fact from inference.** Use "Management guides..." or "Consensus expects..." for attributed claims. Use "Evidence suggests..." for analytical conclusions. State prices, volumes, and filed data without qualification.
4. **Call the evidence.** If six of eight evidence domains contradict the dominant narrative, say so. Do not hide behind balanced language when the evidence is not balanced.
5. **End with action.** End sections with a specific, time-bound action or monitoring trigger, not a vague recommendation.

## Tone Calibration

Write like someone whose bonus depends on being right, not on being liked. Dry, direct, occasionally wry. Never sycophantic. Never breathless. The work speaks for itself.

## Application Scope

This style guide applies to all text fields in research JSON files, including but not limited to:
- `heroCompanyDescription`, `heroDescription`
- `skew.rationale`
- `verdict.text`
- `hypotheses[].description`, `hypotheses[].supporting[]`, `hypotheses[].contradicting[]`
- `narrative.theNarrative`, `narrative.priceImplication.content`, `narrative.evidenceCheck`, `narrative.narrativeStability`
- `evidence.intro`, `evidence.cards[].finding`, `evidence.cards[].tension`
- `discriminators.intro`, `discriminators.rows[].evidence`, `discriminators.nonDiscriminating`
- `tripwires.intro`, `tripwires.cards[].conditions[].then`
- `gaps.analyticalLimitations`
- `identity.overview`
- `featuredRationale`
- `technicalAnalysis.trend.structure`

It also applies to any DNE template literal strings in `index.html` that generate prose (e.g. `renderReportHero()`, `renderNarrative()`, `renderEvidenceCards()`).
