# Investor Briefing PDF Specification

**Date:** 20 February 2026
**Purpose:** Generate a 6-page institutional-quality PDF report for each stock in the Continuum Intelligence coverage universe. Deployed to LinkedIn as thought leadership content. Generated automatically from the stock's existing JSON data.
**Status:** AUTHORITATIVE. This document fully specifies the content, layout, typography, and generation process.

---

## Product Context

Each stock page on the Continuum Intelligence v2 platform has an "Investor Briefing" button that generates a downloadable PDF. This PDF is designed to be shared on LinkedIn as standalone equity research. It must:

1. Look institutional – indistinguishable from a Morgan Stanley or UBS initiation note at first glance
2. Be exactly 6 pages – concise enough for LinkedIn attention spans, substantial enough to demonstrate analytical depth
3. Be fully auto-generated from the stock's existing JSON data – no manual intervention
4. Carry DH Capital Partners branding throughout

---

## Branding and Typography

Follow the DH Capital Partners report-generator specifications exactly:

**Page Setup (A4: 210 x 297mm)**
- Margins: Top 9mm, Bottom 10mm, Left 18mm, Right 18mm
- Header: 10mm from top edge
- Footer: 10mm from bottom edge

**Fonts**
- Primary: Helvetica Neue (fallback: Helvetica, then Arial)
- Title: Helvetica Neue Light, 22pt, black
- Section header: Helvetica Neue Bold, 11pt, black
- Body: Helvetica Neue Light, 10pt, #222222, 1.4x line spacing
- Table body: Helvetica Neue Light, 9pt
- Table header: Helvetica Neue Bold, 9pt, #F2F2F2 fill
- Caption/source: Helvetica Neue Light, 8pt, #999999
- Header/footer: Helvetica Neue, 8pt, #666666

**Colours**
- Brand blue: #0078D4
- Body text: #222222
- Section headers: #000000
- Table gridlines: #DDDDDD (0.25pt)
- Table header fill: #F2F2F2
- Bullish/positive: #2E7D32
- Bearish/negative: #C62828
- Neutral/amber: #EF6C00
- Divider rules: #DDDDDD (0.5pt)

**Header (every page except cover)**
- Left: "DH Capital Partners"
- Right: "[TICKER].AX | Narrative Intelligence"
- Thin rule below: #DDDDDD, 0.5pt, full width

**Footer (every page)**
- Left: "Confidential | For Discussion Purposes Only"
- Centre: page number
- Right: "[Date]"
- Thin rule above: #DDDDDD, 0.5pt, full width

---

## Page-by-Page Layout

### PAGE 1: Cover

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│  [DH Capital Partners Logo]                         │
│  DH Capital Partners | Narrative Intelligence       │
│                                                     │
│  ─────────────────────────────────────────────────  │
│                                                     │
│  [COMPANY NAME]                          22pt Light │
│  [TICKER].AX | [SECTOR] | [GICS Sub-Industry]      │
│                                                     │
│  ─────────────────────────────────────────────────  │
│                                                     │
│  KEY METRICS                              10pt Bold │
│  ┌────────────┬────────────┬────────────┬────────┐  │
│  │ Price      │ Mkt Cap    │ Fwd P/E    │ EV/    │  │
│  │ A$XX.XX    │ A$XX.XB    │ XX.Xx      │ EBITDA │  │
│  │            │            │            │ XX.Xx  │  │
│  ├────────────┼────────────┼────────────┼────────┤  │
│  │ 52wk Range │ Div Yield  │ Revenue    │ NPAT   │  │
│  │ XX - XX    │ X.X%       │ A$XX.XB    │ A$XXXM │  │
│  └────────────┴────────────┴────────────┴────────┘  │
│                                                     │
│  ─────────────────────────────────────────────────  │
│                                                     │
│  OVERALL SENTIMENT: [+/-XX] [LABEL]    colour-coded │
│                                                     │
│  External Environment  [+/-XX]         colour-coded │
│  Company Research      [+/-XX]         colour-coded │
│                                                     │
│  ─────────────────────────────────────────────────  │
│                                                     │
│  KEY TAKEAWAYS                            10pt Bold │
│  • [Takeaway 1 – one sentence, the dominant        │
│    narrative and its conviction level]              │
│  • [Takeaway 2 – the single biggest risk or        │
│    catalyst ahead]                                  │
│  • [Takeaway 3 – the external environment          │
│    context and whether it helps or hurts]           │
│                                                     │
│  ─────────────────────────────────────────────────  │
│                                                     │
│  Marc Duncan | DH Capital Partners                  │
│  marc@dhcapital.com.au                              │
│  [DD Month YYYY] | Sydney                           │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Data sources:**
- Price, market cap, P/E, EV/EBITDA, 52wk range, div yield, revenue, NPAT: from `identity` section of stock JSON
- Overall Sentiment, External, Company: from composite calculation
- Key takeaways: from `narrative` section or auto-generated from dominant hypothesis + key risk + external context

---

### PAGE 2: Company Identity and Narrative

```
┌─────────────────────────────────────────────────────┐
│  [Header]                                           │
│                                                     │
│  COMPANY OVERVIEW                         11pt Bold │
│                                                     │
│  [2-3 paragraph company description from the        │
│   identity section. What the company does, market   │
│   position, key competitive advantages, recent      │
│   performance context. ~150-200 words.]             │
│                                                     │
│  ─────────────────────────────────────────────────  │
│                                                     │
│  NARRATIVE ASSESSMENT                     11pt Bold │
│                                                     │
│  [The full narrative paragraph from the stock       │
│   page hero section. This is the analyst's          │
│   interpretive summary of the competing             │
│   hypotheses and what the market is pricing.        │
│   ~100-150 words.]                                  │
│                                                     │
│  ─────────────────────────────────────────────────  │
│                                                     │
│  MARKET CONTEXT                           11pt Bold │
│                                                     │
│  Macro Environment: [LABEL] ([value])               │
│    ASX 200: [level] ([change] 1mo)                  │
│    AUD/USD: [rate] ([change])                       │
│    RBA: [rate] ([trajectory])                       │
│    VIX: [level]                                     │
│                                                     │
│  Sector Context: [Narrative Model Name]             │
│    [Primary factor]: [value] ([change] 5d/1mo)      │
│    [Secondary factor if applicable]                 │
│    Sector Signal: [value] ([label])                 │
│                                                     │
│  For commodity stocks, include:                     │
│    Breakeven: [value]                               │
│    Current margin: [X]% above breakeven             │
│    Commodity zone: [BULLISH/NEUTRAL/BEARISH]        │
│                                                     │
│  [Footer]                                           │
└─────────────────────────────────────────────────────┘
```

**Data sources:**
- Company overview: `identity.description` from stock JSON
- Narrative assessment: `narrative.summary` from stock JSON
- Market context: from `macro-factors.json` and stock's sector signal data
- Commodity overlay: from stock's `commodity_overlay` config

---

### PAGE 3: Competing Hypotheses

```
┌─────────────────────────────────────────────────────┐
│  [Header]                                           │
│                                                     │
│  COMPETING HYPOTHESES                     11pt Bold │
│                                                     │
│  Dominant Narrative: [Hypothesis ID]: [Name]        │
│  ([SENTIMENT], [Score]%)                            │
│                                                     │
│  ─────────────────────────────────────────────────  │
│                                                     │
│  For each hypothesis (sorted by score descending):  │
│                                                     │
│  [ID]: [NAME]              [SENTIMENT badge] [XX%]  │
│  ───────────────────────────────────────────── ──── │
│  [2-3 sentence description of the hypothesis]       │
│                                                     │
│  Supporting evidence:                               │
│  • [Domain]: [Evidence summary]                     │
│  • [Domain]: [Evidence summary]                     │
│  • [Domain]: [Evidence summary]                     │
│                                                     │
│  Contradicting evidence:                            │
│  • [Domain]: [Evidence summary]                     │
│  • [Domain]: [Evidence summary]                     │
│                                                     │
│  ─────────────────────────────────────────────────  │
│                                                     │
│  [Repeat for each hypothesis. If 4 hypotheses       │
│   don't fit on one page, the top 2 go on page 3    │
│   and the bottom 2 go on page 4. Adjust the        │
│   evidence bullet count to fit: dominant gets       │
│   3-4 supporting + 2 contradicting, others get     │
│   2-3 supporting + 1-2 contradicting.]             │
│                                                     │
│  [Footer]                                           │
└─────────────────────────────────────────────────────┘
```

**Layout rule:** The dominant hypothesis (highest score) gets the most space. If all four hypotheses fit on one page with adequate evidence, keep them on page 3. If not, split: top 2 on page 3, bottom 2 on page 4, and shift subsequent pages accordingly. The total document must not exceed 6 pages.

**Data sources:**
- All hypothesis data from stock JSON `hypotheses` array
- Evidence from `evidence` section

---

### PAGE 4: Evidence Matrix and Discriminators

```
┌─────────────────────────────────────────────────────┐
│  [Header]                                           │
│                                                     │
│  DIAGNOSTIC EVIDENCE                      11pt Bold │
│                                                     │
│  The following evidence items have the highest      │
│  discriminating power between hypotheses:           │
│                                                     │
│  ┌──────────────────┬────┬────┬────┬────┬─────────┐ │
│  │ Evidence Item    │ H1 │ H2 │ H3 │ H4 │ Diag.   │ │
│  ├──────────────────┼────┼────┼────┼────┼─────────┤ │
│  │ [Item 1]         │ C  │ I  │ C  │ I  │ HIGH    │ │
│  │ [Item 2]         │ I  │ C  │ I  │ C  │ HIGH    │ │
│  │ [Item 3]         │ C  │ C  │ I  │ N  │ MEDIUM  │ │
│  │ [Item 4]         │ N  │ I  │ C  │ I  │ MEDIUM  │ │
│  │ [Item 5]         │ C  │ C  │ C  │ C  │ LOW     │ │
│  └──────────────────┴────┴────┴────┴────┴─────────┘ │
│                                                     │
│  C = Consistent, I = Inconsistent, N = Neutral      │
│  Diagnosticity = ability to discriminate between    │
│  hypotheses. HIGH items are most informative.       │
│                                                     │
│  ─────────────────────────────────────────────────  │
│                                                     │
│  KEY DISCRIMINATORS                       11pt Bold │
│                                                     │
│  [List the top 3-4 discriminating factors that      │
│   would shift the dominant narrative. Each as a     │
│   short paragraph: what the evidence is, which      │
│   hypotheses it supports vs contradicts, and what   │
│   outcome would be most diagnostic.]                │
│                                                     │
│  ─────────────────────────────────────────────────  │
│                                                     │
│  TRIPWIRES                                11pt Bold │
│                                                     │
│  ┌───────────────────┬──────────┬──────────────────┐│
│  │ Condition         │ Trigger  │ Action           ││
│  ├───────────────────┼──────────┼──────────────────┤│
│  │ [Tripwire 1]      │ [Value]  │ [Reassess/Exit]  ││
│  │ [Tripwire 2]      │ [Value]  │ [Reassess/Exit]  ││
│  │ [Tripwire 3]      │ [Value]  │ [Reassess/Exit]  ││
│  └───────────────────┴──────────┴──────────────────┘│
│                                                     │
│  [Footer]                                           │
└─────────────────────────────────────────────────────┘
```

**Data sources:**
- Evidence matrix: from `evidence` and `discriminates` sections
- Discriminators: from `discriminates` section
- Tripwires: from `tripwires` section

---

### PAGE 5: Technical and Gaps

```
┌─────────────────────────────────────────────────────┐
│  [Header]                                           │
│                                                     │
│  TECHNICAL PICTURE                        11pt Bold │
│                                                     │
│  [If TA data exists in the stock JSON:]             │
│                                                     │
│  ┌────────────────┬──────────┬────────────────────┐ │
│  │ Indicator      │ Value    │ Signal             │ │
│  ├────────────────┼──────────┼────────────────────┤ │
│  │ RSI (14)       │ XX.X     │ [Overbought/etc]   │ │
│  │ MACD           │ XX.X     │ [Bull/Bear cross]  │ │
│  │ 50d MA         │ A$XX.XX  │ [Above/Below]      │ │
│  │ 200d MA        │ A$XX.XX  │ [Above/Below]      │ │
│  │ Volume (20d)   │ XX.XM    │ [Above/Below avg]  │ │
│  └────────────────┴──────────┴────────────────────┘ │
│                                                     │
│  Key levels:                                        │
│  Support: A$XX.XX, A$XX.XX                          │
│  Resistance: A$XX.XX, A$XX.XX                       │
│                                                     │
│  [If no TA data: "Technical analysis pending –      │
│   signals will be incorporated when the TA agent    │
│   is deployed."]                                    │
│                                                     │
│  ─────────────────────────────────────────────────  │
│                                                     │
│  ANALYTICAL GAPS                          11pt Bold │
│                                                     │
│  The following information would materially         │
│  improve the confidence of this analysis:           │
│                                                     │
│  • [Gap 1: specific missing data point]             │
│  • [Gap 2: specific missing data point]             │
│  • [Gap 3: specific missing data point]             │
│  • [Gap 4: specific missing data point]             │
│                                                     │
│  Each gap includes: what is missing, why it         │
│  matters, and which hypothesis it would most        │
│  affect.                                            │
│                                                     │
│  ─────────────────────────────────────────────────  │
│                                                     │
│  UPCOMING CATALYSTS                       11pt Bold │
│                                                     │
│  ┌───────────────┬──────────────────────────────┐   │
│  │ Date          │ Event                        │   │
│  ├───────────────┼──────────────────────────────┤   │
│  │ [Date]        │ [Earnings/AGM/Catalyst]      │   │
│  │ [Date]        │ [Regulatory decision/etc]    │   │
│  │ [Date]        │ [Contract announcement/etc]  │   │
│  └───────────────┴──────────────────────────────┘   │
│                                                     │
│  [Footer]                                           │
└─────────────────────────────────────────────────────┘
```

**Data sources:**
- Technical: from `technical` section of stock JSON (or `data/ta-signals/{TICKER}.json`)
- Gaps: from `gaps` section
- Catalysts: from `events` or manually maintained calendar

---

### PAGE 6: Disclaimer

```
┌─────────────────────────────────────────────────────┐
│  [Header]                                           │
│                                                     │
│  IMPORTANT INFORMATION                    11pt Bold │
│                                                     │
│  This document is prepared by DH Capital Partners   │
│  Pty Ltd (ABN XX XXX XXX XXX) for informational     │
│  purposes only. It does not constitute financial    │
│  advice, a recommendation, or an offer to buy or   │
│  sell any securities.                               │
│                                                     │
│  METHODOLOGY                                        │
│                                                     │
│  This analysis uses the Analysis of Competing       │
│  Hypotheses (ACH) framework, originally developed   │
│  by Richards Heuer at the CIA for intelligence      │
│  analysis and adapted here for equity research.     │
│  ACH evaluates multiple competing explanations      │
│  against diagnostic evidence, ranking hypotheses    │
│  by the fewest inconsistencies rather than the      │
│  most confirmations. This approach is designed to   │
│  reduce confirmation bias and anchoring effects     │
│  common in traditional equity research.             │
│                                                     │
│  Sentiment scores are generated by a three-layer    │
│  decomposition model separating macro environment,  │
│  sector/commodity factors, and company-specific     │
│  research. The 40/60 rule ensures company-specific  │
│  research always contributes at least 60% of the   │
│  overall sentiment, maintaining focus on            │
│  idiosyncratic stock drivers.                       │
│                                                     │
│  LIMITATIONS                                        │
│                                                     │
│  • Hypothesis scores are model outputs, not         │
│    price targets or investment recommendations      │
│  • Evidence assessment involves subjective          │
│    judgement and may contain errors                  │
│  • Past price performance is not indicative of      │
│    future returns                                   │
│  • This analysis does not account for individual    │
│    investor circumstances, risk tolerance, or       │
│    tax position                                     │
│  • Data sources include ASX announcements, broker   │
│    research, company filings, and market data.      │
│    Errors in source data will propagate             │
│                                                     │
│  CONFLICTS                                          │
│                                                     │
│  DH Capital Partners and/or its principals may      │
│  hold positions in securities discussed in this     │
│  document. Positions may change without notice.     │
│                                                     │
│  CONTACT                                            │
│                                                     │
│  Marc Duncan                                        │
│  DH Capital Partners                                │
│  marc@dhcapital.com.au                              │
│  Sydney, Australia                                  │
│                                                     │
│  ─────────────────────────────────────────────────  │
│                                                     │
│  © 2026 DH Capital Partners Pty Ltd.                │
│  All rights reserved.                               │
│                                                     │
│  [Footer]                                           │
└─────────────────────────────────────────────────────┘
```

---

## Technical Implementation

### Library

Use **ReportLab** (Python) with the Platypus high-level layout engine. Do NOT use basic Canvas drawing for body content – Platypus handles pagination, text flow, and table layout correctly.

```python
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, Image, HRFlowable
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
```

### Font Registration

```python
# Try Helvetica Neue first, fall back to Helvetica (built-in), then Arial
try:
    pdfmetrics.registerFont(TTFont('HelveticaNeue', 'HelveticaNeue.ttf'))
    pdfmetrics.registerFont(TTFont('HelveticaNeue-Bold', 'HelveticaNeue-Bold.ttf'))
    pdfmetrics.registerFont(TTFont('HelveticaNeue-Light', 'HelveticaNeue-Light.ttf'))
    FONT_FAMILY = 'HelveticaNeue'
    FONT_BOLD = 'HelveticaNeue-Bold'
    FONT_LIGHT = 'HelveticaNeue-Light'
except:
    # Helvetica is built into ReportLab
    FONT_FAMILY = 'Helvetica'
    FONT_BOLD = 'Helvetica-Bold'
    FONT_LIGHT = 'Helvetica'
```

### Page Template with Header/Footer

```python
def header_footer(canvas, doc):
    canvas.saveState()
    width, height = A4
    
    # Header (skip on page 1 – cover page)
    if doc.page > 1:
        canvas.setFont(FONT_FAMILY, 8)
        canvas.setFillColor(HexColor('#666666'))
        canvas.drawString(18*mm, height - 9*mm, "DH Capital Partners")
        canvas.drawRightString(width - 18*mm, height - 9*mm, f"{ticker}.AX | Narrative Intelligence")
        # Header rule
        canvas.setStrokeColor(HexColor('#DDDDDD'))
        canvas.setLineWidth(0.5)
        canvas.line(18*mm, height - 10*mm, width - 18*mm, height - 10*mm)
    
    # Footer (all pages)
    canvas.setFont(FONT_FAMILY, 8)
    canvas.setFillColor(HexColor('#666666'))
    canvas.drawString(18*mm, 10*mm, "Confidential | For Discussion Purposes Only")
    canvas.drawCentredString(width/2, 10*mm, str(doc.page))
    canvas.drawRightString(width - 18*mm, 10*mm, report_date)
    # Footer rule
    canvas.setStrokeColor(HexColor('#DDDDDD'))
    canvas.setLineWidth(0.5)
    canvas.line(18*mm, 12*mm, width - 18*mm, 12*mm)
    
    canvas.restoreState()
```

### Paragraph Styles

```python
styles = {
    'Title': ParagraphStyle(
        'Title', fontName=FONT_LIGHT, fontSize=22, textColor=HexColor('#000000'),
        spaceAfter=6*mm, leading=26
    ),
    'SectionHeader': ParagraphStyle(
        'SectionHeader', fontName=FONT_BOLD, fontSize=11, textColor=HexColor('#000000'),
        spaceBefore=4*mm, spaceAfter=2*mm, leading=14
    ),
    'Body': ParagraphStyle(
        'Body', fontName=FONT_LIGHT, fontSize=10, textColor=HexColor('#222222'),
        leading=14, spaceAfter=2*mm
    ),
    'Bullet': ParagraphStyle(
        'Bullet', fontName=FONT_LIGHT, fontSize=10, textColor=HexColor('#222222'),
        leading=14, leftIndent=8*mm, bulletIndent=4*mm, spaceAfter=1.5*mm
    ),
    'Caption': ParagraphStyle(
        'Caption', fontName=FONT_LIGHT, fontSize=8, textColor=HexColor('#999999'),
        spaceAfter=3*mm
    ),
    'Disclaimer': ParagraphStyle(
        'Disclaimer', fontName=FONT_LIGHT, fontSize=8.5, textColor=HexColor('#222222'),
        leading=11, spaceAfter=2*mm, alignment=TA_JUSTIFY
    ),
}
```

### Table Style

```python
STANDARD_TABLE_STYLE = TableStyle([
    ('FONT', (0, 0), (-1, 0), FONT_BOLD, 9),           # Header row bold
    ('FONT', (0, 1), (-1, -1), FONT_LIGHT, 9),          # Body rows light
    ('BACKGROUND', (0, 0), (-1, 0), HexColor('#F2F2F2')), # Header fill
    ('TEXTCOLOR', (0, 0), (-1, -1), HexColor('#222222')),
    ('GRID', (0, 0), (-1, -1), 0.25, HexColor('#DDDDDD')),
    ('TOPPADDING', (0, 0), (-1, -1), 3),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ('LEFTPADDING', (0, 0), (-1, -1), 4),
    ('RIGHTPADDING', (0, 0), (-1, -1), 4),
    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
])
```

### Sentiment Colour Helper

```python
def sentiment_colour(value):
    if value > 8: return HexColor('#2E7D32')   # Green
    if value < -8: return HexColor('#C62828')   # Red
    return HexColor('#EF6C00')                   # Amber

def sentiment_label(value):
    if value > 25: return 'STRONG UPSIDE'
    if value > 8: return 'UPSIDE'
    if value > -8: return 'NEUTRAL'
    if value > -25: return 'DOWNSIDE'
    return 'STRONG DOWNSIDE'
```

### Horizontal Rule Helper

```python
def divider():
    return HRFlowable(
        width="100%", thickness=0.5, color=HexColor('#DDDDDD'),
        spaceBefore=3*mm, spaceAfter=3*mm
    )
```

---

## Data Mapping

The PDF generator reads data from these sources in the stock's directory:

| PDF Section | Source File/Field | Fallback |
|-------------|-------------------|----------|
| Company name, ticker, sector | `{TICKER}.json` → `name`, `ticker`, `gics_sub_industry` | Required |
| Price, mkt cap, P/E, etc. | `{TICKER}.json` → `identity` section | Required |
| 52-week range | `{TICKER}.json` → `identity.week52_high`, `identity.week52_low` | Required |
| Narrative summary | `{TICKER}.json` → `narrative.summary` | Required |
| Company description | `{TICKER}.json` → `identity.description` | Required |
| Overall Sentiment | `{TICKER}.json` → `overall_sentiment` | Required |
| External/Company breakdown | `{TICKER}.json` → `external_signal`, `company_signal` | Required |
| Macro context | `data/macro-factors.json` | Required |
| Sector signal | `{TICKER}.json` → `sector_signal`, `sector_contribution` | Required |
| Commodity overlay | `{TICKER}.json` → `commodity_overlay` | If applicable |
| Hypotheses | `{TICKER}.json` → `hypotheses[]` | Required |
| Evidence | `{TICKER}.json` → `evidence[]` | Required |
| Discriminators | `{TICKER}.json` → `discriminates[]` | Required |
| Tripwires | `{TICKER}.json` → `tripwires[]` | Required |
| Technical data | `data/ta-signals/{TICKER}.json` | Optional |
| Gaps | `{TICKER}.json` → `gaps[]` | Required |
| Catalysts/Events | `{TICKER}.json` → `events[]` | Optional |

---

## Generation Process

### Script Location

Create `scripts/generate-investor-briefing.js` (or `.py`). This script:

1. Takes a ticker as argument: `node scripts/generate-investor-briefing.js WOW`
2. Reads the stock JSON and macro-factors JSON
3. Builds the 6-page PDF using ReportLab
4. Saves to `public/reports/{TICKER}-investor-briefing.pdf`
5. The "Investor Briefing" button on the stock page links to this file

### Batch Generation

Add to the daily pipeline (Phase 7, after all scores are recalculated):

```bash
# Generate briefings for all coverage stocks
for ticker in $(ls data/stocks/*.json | xargs -I{} basename {} .json); do
    python scripts/generate-investor-briefing.py $ticker
done
```

### Page Budget Management

The document must be exactly 6 pages. To enforce this:

- Cover page: fixed content, always fits
- Page 2 (Identity/Narrative): trim company description to 200 words max, narrative to 150 words max
- Page 3 (Hypotheses): if 4 hypotheses don't fit, reduce evidence bullets (dominant gets 3+2, others get 2+1)
- Page 4 (Evidence/Discriminators): limit evidence matrix to top 8 most diagnostic items, tripwires to 3-4
- Page 5 (Technical/Gaps): limit gaps to 4-5, catalysts to 3-4
- Page 6 (Disclaimer): fixed content, always fits

If content overflows to 7 pages, trim in this order:
1. Reduce evidence bullets on non-dominant hypotheses
2. Reduce gap items
3. Shorten company description
4. Reduce evidence matrix rows

Never exceed 6 pages. Never drop below 5 pages (add more evidence detail if under).

---

## Quality Checklist

Before deployment, every generated PDF must pass:

- [ ] Exactly 6 pages
- [ ] DH Capital Partners branding on every page
- [ ] No placeholder text ("[TBD]", "XXX", "undefined")
- [ ] All numbers formatted correctly (commas, decimal places, currency symbols)
- [ ] Sentiment colours match values (green > +8, red < -8, amber between)
- [ ] Hypotheses sorted by score descending (dominant first)
- [ ] Dominant hypothesis marked
- [ ] Company Research value matches hypothesis balance (not the old T1-vs-T2 method)
- [ ] Evidence matrix C/I/N ratings present
- [ ] Tripwires have specific thresholds, not vague conditions
- [ ] Disclaimer page present and complete
- [ ] Australian English throughout (analyse, colour, favour, defence)
- [ ] Date format DD Month YYYY
- [ ] No em-dashes (use en-dashes or restructure)
- [ ] PDF renders correctly in Preview, Chrome, and Adobe Reader
- [ ] File size under 2MB (no embedded images except logo)
- [ ] Filename format: {TICKER}-investor-briefing.pdf

---

## Common Pitfalls (Why Previous Attempts Failed)

Based on prior failed attempts, avoid these specific errors:

1. **Using Canvas drawing instead of Platypus.** Canvas requires manual coordinate calculation for every element. Text overflows, tables misalign, pagination breaks. Use Platypus `SimpleDocTemplate` with flowables (Paragraph, Table, Spacer, PageBreak). Platypus handles pagination automatically.

2. **Hardcoding absolute Y positions.** Content length varies by stock. A fixed Y position that works for WOW will overflow for a stock with longer hypothesis descriptions. Let Platypus flow the content.

3. **Not registering fonts properly.** If Helvetica Neue isn't available, the fallback chain must work. Test with the fallback font (Helvetica/Arial) to ensure layout doesn't break.

4. **Unicode characters in bullet points.** ReportLab's built-in fonts don't support fancy Unicode bullets. Use Platypus `ListFlowable` or simple dash/dot characters.

5. **Tables exceeding page width.** With 18mm margins on each side, the usable width is 174mm. Tables must fit within this. Use percentage-based column widths, not absolute.

6. **Not testing with actual stock data.** Generate for at least 3 stocks (one commodity, one company-dominant, one rate-sensitive) before declaring success. Different data shapes expose different layout issues.

7. **Generating content instead of reading from JSON.** The PDF generator should NOT be writing research. It reads from the stock JSON and formats it. If the JSON doesn't have the data, the field shows "Pending" or is omitted – do not fabricate content.

---

## Instructions to Developer

> Read INVESTOR_BRIEFING_SPEC.md. Build the PDF generator script using Python ReportLab with Platypus (NOT Canvas drawing). The script reads all content from the stock's existing JSON data and macro-factors.json – it does not generate research content.
>
> Build page by page following the exact layouts in this document. Test with WOW.AX, BHP.AX, and DRO.AX. Each must produce exactly 6 pages with correct branding, sentiment colours, hypothesis ordering (score descending), and no placeholder text.
>
> Common failure modes are listed at the end of the document. Read them before starting. The previous attempt failed because it used Canvas drawing with hardcoded positions instead of Platypus flowables.
