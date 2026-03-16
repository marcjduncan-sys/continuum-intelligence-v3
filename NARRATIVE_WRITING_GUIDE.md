# Continuum Intelligence — Narrative Writing Guide
## For Backend Developers and Content Contributors

**Version 1.0 · February 2026**

---

## Purpose

This guide defines how to write the narrative content that drives the Continuum Intelligence platform. Every field described here is consumed directly by the display layer — what you write is exactly what users read. There is no editorial review layer. Quality is enforced here, at the source.

The platform's value proposition is precision without hedging, evidence without noise, and narrative without spin. Developers writing content programmatically or populating research JSON files must internalise these standards before writing a single line.

---

## The Platform's Core Claim

> **The market is always pricing something. Our job is to name it precisely, then test whether it's right.**

Every narrative field on this platform is answering one question: *What does the current price imply about the future, and is that implication supported by evidence?*

That framing — embedded thesis, evidence test, divergence flag — must run through every piece of text the platform produces.

---

## Part 1: The Field Schema

### The Six Fields That Matter Most

These are the fields rendered prominently in the UI. Everything else supports them.

---

### 1. `big_picture` — The One-Paragraph Orientation

**Where it appears:** The intro panel at the top of every stock page.

**What it must do:** Orient a reader who knows the company in 3–5 sentences. State what the company does, what the dominant narrative currently is, what the key risk is, and what data point to watch next. No opinions — just the setup.

**Length:** 80–120 words.

**Formula:**
```
[Company] is [what it does, market position, scale].
The bull case is [specific bull thesis in one clause].
The bear case is [specific bear risk in one clause].
At [current price], the stock is priced for [what the market is pricing].
[Key catalyst] is the single most diagnostic event in the near term.
```

**Good example (CBA):**
> "CBA's digital-first strategy, dominant market position, and operational efficiency justify a sustained premium to peers. 1H FY25 delivered cash NPAT of $5.13B, up 2%, with NIM of 1.99% (down 4bp). However, at ~24x forward P/E, CBA is priced for perfection in an environment where NIMs are compressing, mortgage competition is fierce, and the RBA is cutting rates. The quality is undeniable, but the price already reflects it and then some. The risk/reward is asymmetric to the downside at current levels."

**Bad example:**
> "CBA is a major Australian bank with strong digital capabilities and could potentially see some margin pressure going forward. Investors should watch for changes in the macro environment."

Why it fails: "could potentially", "some margin pressure", "changes in the macro environment" — all hedged, all vague, no price anchor, no specific metric.

---

### 2. `hypotheses[].plain_english` — The Reader-Level Hypothesis Description

**Where it appears:** The hypothesis card on each stock's research page. This is the first thing a non-expert reads.

**What it must do:** Explain what would have to be true for this hypothesis to play out, in plain language, without jargon. Think: explaining to a smart friend who doesn't work in finance.

**Length:** 2–4 sentences.

**Formula:**
```
[What the world looks like if this hypothesis is right, in concrete terms].
[The mechanism — why this leads to a good/bad outcome for shareholders].
[The specific thing that would confirm or deny it].
```

**Good example (WOW D1 — Managed Turnaround):**
> "The evidence suggests Woolworths is in recovery mode. Margins are improving, digital sales are growing, and management is executing well on its transformation strategy."

**Good example (WOW D4 — Competitive Disruption):**
> "This is the worst-case scenario: a new competitor like Amazon Fresh launches in Australia and fundamentally changes how people buy groceries, making Woolworths' store network a liability rather than an asset."

**What makes these work:** Concrete ("Amazon Fresh launches in Australia"), consequence-linked ("store network a liability"), and calibrated to seriousness (worst-case framing is explicit).

---

### 3. `hypotheses[].what_to_watch` — The Diagnostic Indicator

**Where it appears:** The hypothesis card, under "What to Watch."

**What it must do:** Give the reader a specific, observable, measurable indicator. Not a theme — a metric with a threshold.

**Length:** 2 sentences maximum. One sentence ideally.

**Formula:**
```
[Specific metric] [over what timeframe]. If [threshold], [consequence for hypothesis].
```

**Good examples:**
- `"Q3 FY26 margins and online penetration rate. If Australian Food EBIT margin holds above 5.5% and e-commerce grows >20% YoY, this narrative strengthens."`
- `"ALDI market share data and quarterly cost inflation trends. If ALDI share exceeds 12% nationally, this narrative gains weight."`
- `"Quarterly NIM disclosures, RBA rate decisions, deposit mix trends."`

**Bad example:**
- `"Keep an eye on competitive dynamics and the macro environment."`

Why it fails: No metric, no threshold, no timeframe. Tells the reader nothing actionable.

---

### 4. `hypotheses[].risk_plain` — The Downside in One Sentence

**Where it appears:** The hypothesis card, under "Risk."

**What it must do:** State the specific failure mode for this hypothesis, with a mechanism and a consequence. One sentence.

**Good examples:**
- `"If competition from ALDI and Costco intensifies faster than expected, margin recovery could stall."`
- `"If NIM falls to 1.85-1.90%, EPS could decline 5-8% from peak levels."`
- `"If Amazon Fresh launches in Australian metro areas, it could trigger a structural re-rating of the entire sector."`

**Pattern to notice:** Every risk statement has the form *"If [specific event], [specific consequence]."* Never "there is risk of" or "challenges may emerge."

---

### 5. `narrative.theNarrative` — The Embedded Thesis Paragraph

**Where it appears:** The "Dominant Narrative" panel on the report page. This is the most important text field on the platform.

**What it must do:** State what the market is currently pricing in one flowing paragraph. This is not what you think about the stock. It is what the market thinks — expressed as a coherent thesis, grounded in specific prices and metrics.

**Length:** 80–150 words. One paragraph only.

**Formula:**
```
Opening: State what the market is pricing. Name the thesis explicitly.
Middle: Ground it in specific price levels, multiples, or metrics that imply this thesis.
Then: Name the key assumption that must hold for this thesis to be correct.
Closing: Identify the single most important risk to this assumption.
```

**Full good example (WOW):**
> "The market is pricing a managed turnaround under new CEO Amanda Bardwell. The embedded thesis is that FY25 was an aberration, impacted by $95M in industrial action costs, a CEO transition, and one-off supply chain disruption, and that FY26 marks the beginning of a recovery. The $400M above-store cost-out program, e-commerce scaling at +17% growth rates, and simplified operations will restore Australian Food to mid-to-high single-digit EBIT growth. The premium valuation (23.9x forward P/E) assumes this recovery is underway."

**Full good example (CBA):**
> "CBA is the highest-quality bank franchise in Australia, and possibly the most expensive bank stock in the developed world. The bull case is straightforward: CBA's digital leadership (8.7M app users), cost efficiency (44.7% CTI), and dominant market position create a compounding machine that deserves a structural premium. The bear case is equally clear: at 24x forward earnings, the stock is priced for a level of perfection that banking economics cannot deliver. NIMs are compressing (1.99%, down 14bp from peak), mortgage competition is intensifying, and credit costs are at cyclical lows that must eventually normalise."

**What makes these work:**
- Every claim has a number attached: `23.9x`, `$95M`, `+17%`, `8.7M users`, `44.7%`, `1.99%`
- The word "priced" or "pricing" appears — this is always a price-anchored assessment
- The thesis is named explicitly: "managed turnaround", "digital franchise premium"
- The tension is stated without weasel words

---

### 6. `verdict.text` — The Bottom Line

**Where it appears:** The coloured verdict banner at the top of every report.

**What it must do:** Give the reader a single, crisp bottom line. What is the market pricing, what does the evidence say, and what is the key diagnostic event. Maximum 2 sentences.

**Good examples:**
- `"The market is pricing a Bardwell turnaround at a premium multiple, but FY25 delivered a 19% NPAT decline. FY26 is 'transitional'; the 1H results on 25 February are the single most diagnostic event for whether this is a trough or a new normal."`
- `"1H FY25 delivered cash NPAT of $5.13B, up 2% on pcp, with NIM of 1.99% (down 4bp). At ~24x forward P/E, CBA is priced for perfection in an environment where NIMs are compressing — the risk/reward is asymmetric to the downside."`

**The verdict must:**
- Name the embedded price thesis in the first sentence
- Identify the key tension in the second sentence
- Name a specific upcoming catalyst or current data point

---

## Part 2: Tone and Voice Rules

These are non-negotiable. Violations will make the platform look like a generic research chatbot, which it is explicitly not.

---

### Rule 1: Price-Anchor Everything

Every narrative sentence either mentions a price, a multiple, a metric, or a date. Abstract assessments without data anchors are not permitted.

| ❌ Wrong | ✅ Right |
|---------|---------|
| "The company faces margin pressure." | "Australian Food EBIT margins declined to 4.1%, down 60bp, as input cost inflation outpaced pricing." |
| "The valuation looks stretched." | "At 24x forward P/E, CBA is trading at a 40% premium to the sector average." |
| "Growth has been strong." | "E-commerce grew +17% YoY, now representing 11% of Australian Food sales." |
| "Management is executing well." | "The $400M cost-out program is tracking ahead of schedule, with $180M delivered in H1." |

---

### Rule 2: No Hedge Words

The following words are banned from all narrative output:

> **could, might, perhaps, potentially, arguably, somewhat, relatively, seems, appears to be, may, suggests that perhaps, it is possible that, investors might consider**

Use instead: *is, does, will, drives, implies, signals, indicates, shows, confirms, contradicts.*

The platform takes a position. It does not sit on the fence.

| ❌ Wrong | ✅ Right |
|---------|---------|
| "Competition could potentially impact margins." | "Competition is compressing margins." |
| "The thesis might be challenged if sales slow." | "The thesis is contradicted if sales growth falls below 3%." |
| "Results were arguably disappointing." | "Results missed consensus by 8%." |

---

### Rule 3: Name the Hypothesis, Not the Sentiment

When describing a hypothesis outcome, name the specific thesis being tested — not a generic bull/bear sentiment.

| ❌ Wrong | ✅ Right |
|---------|---------|
| "Bullish indicators are accumulating." | "Evidence accumulating for D1 (Managed Turnaround)." |
| "This is a bearish sign." | "This contradicts D1 (Managed Turnaround) and strengthens D2 (Structural Margin Erosion)." |
| "The stock could go either way." | "D1 and D2 are within 15% survival score of each other — the narrative is genuinely contested." |

---

### Rule 4: Price Move Vocabulary

Use precise language for market moves. The magnitude of language must match the magnitude of the move.

| Move | Language |
|------|----------|
| +/- 0–2% | "moved", "edged", "drifted" |
| +/- 2–5% | "declined", "rallied", "pulled back", "recovered" |
| +/- 5–10% | "declined sharply", "surged", "fell", "jumped" |
| +/- 10%+ | "collapsed", "fell precipitously", "surged dramatically", "capitulated" |
| With high volume | Add: "on elevated turnover", "on 2.3x average volume" |
| Against the sector | Add: "while the sector was flat", "diverging from sector +1.2%" |

---

### Rule 5: Evidence Tags Must Match the Text

When writing evidence card content, the tag you apply (Supports D1 / Contradicts D2) must be literally described in the finding text. Never tag something as "Supports D1" if the finding text doesn't make that connection explicit.

**Good pattern:**
- Finding: `"Australian Food EBIT margin improved to 4.8%, above the 4.5% consensus — margin recovery is tracking ahead of schedule."`
- Tag: `Supports D1` (Managed Turnaround — margin recovery is the thesis)

**Bad pattern:**
- Finding: `"Revenue grew 2.1% in Q1 FY26."`
- Tag: `Supports D1` ← This doesn't follow. Revenue growth alone doesn't tell us about the turnaround.

---

### Rule 6: Epistemic Class Discipline

Every evidence card must carry an epistemic class. These are not aesthetic choices — they tell the reader how much weight to place on the finding.

| Class | When to use | Example |
|-------|-------------|---------|
| `ep-objective` | Hard data: prices, volume, reported earnings | "NPAT of $5.13B, up 2%" |
| `ep-statutory` | ASX filings, regulatory disclosures | "ASX announcement: FY26 guidance reaffirmed" |
| `ep-consensus` | Broker consensus, analyst surveys | "Consensus EPS: $2.14, range $1.98–$2.31" |
| `ep-independent` | Third-party research, academic studies | "Roy Morgan: ALDI awareness +3pts nationally" |
| `ep-governance` | Board decisions, management statements | "CEO: 'We expect margin recovery in H2'" |
| `ep-motivated` | Company-sourced data, investor day material | "Investor Day slide: $400M cost-out 'on track'" |
| `ep-behavioural` | Short interest, fund flows, sentiment data | "Short interest: 3.2% of float, rising" |
| `ep-noise` | Market commentary, press speculation | "AFR: 'Sources suggest strategic review underway'" |

**Rule:** Never use `ep-noise` as a primary evidence source. It can appear as context only, with explicit acknowledgment of its low epistemic weight.

---

## Part 3: The Auto-Generation Templates

When scripts generate narrative content, they must follow these templates precisely. The templates exist because consistent structure allows the reader to extract signal faster.

---

### Event-Driven Narrative Injection (narrative-generator.js)

When a significant event fires, the system injects text into the relevant hypothesis card. The format is always:

**Earnings Beat:**
```
"Recent [period] results showed [improving/declining] earnings trajectory.
EPS of $[X], [+/-Y%] vs consensus."
```

**Guidance Raise:**
```
"Management raised FY[YY] guidance to [range], suggesting the [thesis name]
narrative is gaining traction."
```

**Guidance Cut:**
```
"Management reduced FY[YY] guidance, indicating a more challenging operating
environment than [prior guidance] anticipated."
```

**Acquisition:**
```
"Acquisition of [target] for $[X] introduces integration execution risk and
capital allocation questions."
```

**Regulatory Investigation:**
```
"Regulatory investigation escalates compliance risk and potential for material
penalties. [Affected hypothesis] strengthened."
```

**Analyst Downgrade:**
```
"Analyst downgrade reflects execution concerns and stretched valuation.
Risk skew concerns spreading to sell-side."
```

---

### Price-Narrative Inference Commentary (institutional-commentary-engine.js)

When price action is significant, the system generates an evidence item. The format:

**Executive Summary:**
```
"[Company] [price verb: rallied/declined/fell/surged] [X]% [volume description]
[descriptor adjectives]. The [magnitude] [pattern type] reflects [sentiment]
positioning as investors reassess the thesis amid [contextual factor]."
```

**Market Narrative Paragraph:**
```
"Market-implied narrative (confidence: [X]%): The price action is pricing in
[Hypothesis Name] as the dominant driver. Short-term weight ([ST]%)
[exceeds/trails] research view ([LT]%), suggesting [concern] is
[acute/elevated/premature/overstated]. Secondary: [name] ([weight]% blended)."
```

**Divergence Alert (>20 point spread):**
```
"[Major/Moderate] disconnect detected. [Hypothesis Name]: research [LT]% vs
market-implied [ST]% ([gap]-point spread)."
```

---

## Part 4: The Sentiment Decomposition Display (ERRATA_003)

As of the February 2026 platform rebuild, the three-layer signal is displayed as three independently-coloured rows. Developers writing copy for the display layer must understand this architecture.

### The Three Rows

**Row 1 — Overall Sentiment**
Shows the composite score from all signal sources. Colour thresholds: **>+8 green, <-8 red, amber between.**

**Row 2 — External Environment**
Shows `macro_contribution + sector_contribution + tech_contribution`. This row isolates what the broader market environment is doing to the stock. Colour thresholds: **>+5 green, <-5 red, amber between.**

**Row 3 — Company Research**
Shows `company_contribution` from the hypothesis survival engine. This row reflects what the fundamental research says about the company specifically. Same thresholds: **>+5 green, <-5 red.**

### The Divergence Insight

When Row 2 and Row 3 are different colours, the platform is surfacing its most important signal:

- **External GREEN, Company AMBER/RED:** "The macro tailwind is propping up a company with weak fundamentals. Be cautious — when the tailwind fades, the stock is exposed."
- **External AMBER/RED, Company GREEN:** "The company's fundamentals are strong despite an unfavourable macro environment. Potential mispricing if the macro environment improves."
- **Both GREEN:** "Aligned — the company and external environment are both supportive."
- **Both RED:** "Aligned — broad deterioration across both layers."

When writing any commentary that references sentiment, your text must acknowledge both layers if they diverge by more than 5 points. Never describe the "sentiment" as a single number without noting if the decomposition tells a different story.

---

## Part 5: What Good Output Looks Like End-to-End

The following is a complete example of correctly-formatted content for a hypothetical stock showing divergence between external and company signals.

---

### Sample: HRZ (Horizon Oil) — Company Dominant Case

**`big_picture`:**
> "Horizon Oil is a small-cap E&P with producing assets in PNG and China. The dominant narrative is growth: new PNG production is ramping ahead of schedule, management has a credible track record of reserve replacement, and the commodity backdrop remains constructive. At A$0.34, the stock trades at a significant discount to NAV under most commodity price scenarios. The single most diagnostic event is the Q1 PNG production update."

**`hypotheses.D1.plain_english`:**
> "PNG production ramps ahead of schedule, NAV discount closes as the market recognises the asset quality. This is the base case: execution continues, reserves grow, and the stock re-rates toward intrinsic value."

**`hypotheses.D1.what_to_watch`:**
> "Quarterly production reports from the PNG joint venture. If gross production exceeds 4,500 bbl/day for two consecutive quarters, the growth narrative is confirmed."

**`hypotheses.D1.risk_plain`:**
> "If PNG production falters due to technical issues or weather disruption, the growth premium dissipates and the stock reverts to a distressed asset valuation."

**`narrative.theNarrative`:**
> "The market is pricing HRZ as a PNG growth story with free optionality on a China restart. At A$0.34 — a 35% discount to NAV at US$70/bbl oil — the embedded thesis is that PNG production ramps cleanly, cash flows cover development capital, and management continues its track record of reserve replacement. The risk is equally clear: small-cap E&Ps trade on momentum, and any production miss would compress both the multiple and the NAV discount simultaneously."

**`verdict.text`:**
> "PNG production is ramping ahead of schedule, and the stock trades at a 35% discount to NAV. The question is whether the market will close that discount before the next capital raise. The Q1 production update is the catalyst."

---

## Part 6: Checklist Before Submitting Content

Before any content enters the platform, run through this checklist:

**Anchoring**
- [ ] Does every sentence reference a specific price, metric, multiple, or date?
- [ ] Is the company's current price mentioned in `theNarrative`?
- [ ] Is the dominant hypothesis named explicitly?

**Tone**
- [ ] Are all hedge words removed (could, might, perhaps, potentially)?
- [ ] Is every risk stated as "If [X], then [Y]" — not as a vague concern?
- [ ] Are price move descriptions calibrated to the actual move magnitude?

**Evidence**
- [ ] Does each evidence card carry the correct epistemic class?
- [ ] Does each tag (Supports/Contradicts) match the text literally?
- [ ] Are `what_to_watch` fields specific enough to be falsifiable?

**Completeness**
- [ ] Is `plain_english` written for a smart non-expert?
- [ ] Is `big_picture` between 80–120 words?
- [ ] Is `theNarrative` a single paragraph between 80–150 words?
- [ ] Is `verdict.text` two sentences maximum?

**Sentiment Display**
- [ ] If external and company signals diverge >5 points, is the divergence acknowledged in the commentary?
- [ ] Are hypothesis survival scores current and consistent with the narrative?

---

## Appendix: Vocabulary Reference

### Hypothesis Status Labels

| `status` field | Display label | When to use |
|----------------|---------------|-------------|
| `HIGH` | Priced In | Market has largely priced this scenario |
| `MODERATE` | Evidence Building | Evidence accumulating, not yet dominant |
| `LOW` | Watching | Possible but not well-supported |
| `VERY_LOW` | Tail Risk | Unlikely, monitored as a tail scenario |

### Sentiment Arrow Conventions

| Score | Arrow | Meaning |
|-------|-------|---------|
| > +3 | ↑ | Positive direction |
| -3 to +3 | → | Neutral / flat |
| < -3 | ↓ | Negative direction |

### Diagnosticity Labels

| Level | When to use |
|-------|-------------|
| `HIGH` | This single event could cause a thesis flip |
| `MEDIUM` | This event meaningfully updates the thesis |
| `LOW` | This event provides incremental evidence only |

---

*Continuum Intelligence — Internal Developer Documentation*
*Last updated: February 2026*
