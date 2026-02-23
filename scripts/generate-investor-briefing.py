"""
Continuum Intelligence — Investor Briefing PDF Generator
Uses ReportLab Platypus (NOT Canvas drawing).
Spec: INVESTOR_BRIEFING_SPEC.md

Usage:
    python scripts/generate-investor-briefing.py WOW
    python scripts/generate-investor-briefing.py BHP
    python scripts/generate-investor-briefing.py DRO
    python scripts/generate-investor-briefing.py --all   (batch all stocks)
"""

import json
import sys
import os
from datetime import datetime
from pathlib import Path

# ── ReportLab imports ────────────────────────────────────────────────────────
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.colors import HexColor, black, white
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable, KeepTogether
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# ── Constants ────────────────────────────────────────────────────────────────
PAGE_W, PAGE_H = A4
MARGIN_L = 18 * mm
MARGIN_R = 18 * mm
MARGIN_T = 22 * mm   # leaves room for header rule at 11mm
MARGIN_B = 22 * mm   # leaves room for footer rule at 12mm
BODY_W = PAGE_W - MARGIN_L - MARGIN_R   # 174mm usable width

BRAND_BLUE  = HexColor('#0078D4')
BODY_TEXT   = HexColor('#222222')
GREY_HEADER = HexColor('#666666')
DIVIDER_CLR = HexColor('#DDDDDD')
TBL_FILL    = HexColor('#F2F2F2')
BULLISH     = HexColor('#2E7D32')
BEARISH     = HexColor('#C62828')
NEUTRAL_CLR = HexColor('#EF6C00')

# ── Font setup ───────────────────────────────────────────────────────────────
FONT_REG  = 'Helvetica'
FONT_BOLD = 'Helvetica-Bold'
FONT_LIGHT = 'Helvetica'   # Helvetica built-in; Light variant requires TTF


# ── Styles ───────────────────────────────────────────────────────────────────
def make_styles():
    return {
        'cover_title': ParagraphStyle(
            'cover_title', fontName=FONT_LIGHT, fontSize=22,
            textColor=black, leading=28, spaceAfter=4 * mm
        ),
        'cover_sub': ParagraphStyle(
            'cover_sub', fontName=FONT_REG, fontSize=10,
            textColor=HexColor('#444444'), leading=14, spaceAfter=3 * mm
        ),
        'section_header': ParagraphStyle(
            'section_header', fontName=FONT_BOLD, fontSize=11,
            textColor=black, leading=14,
            spaceBefore=3 * mm, spaceAfter=2 * mm
        ),
        'sub_header': ParagraphStyle(
            'sub_header', fontName=FONT_BOLD, fontSize=9.5,
            textColor=black, leading=13,
            spaceBefore=2 * mm, spaceAfter=1 * mm
        ),
        'body': ParagraphStyle(
            'body', fontName=FONT_LIGHT, fontSize=9.5,
            textColor=BODY_TEXT, leading=14, spaceAfter=2 * mm,
            alignment=TA_JUSTIFY
        ),
        'body_left': ParagraphStyle(
            'body_left', fontName=FONT_LIGHT, fontSize=9.5,
            textColor=BODY_TEXT, leading=14, spaceAfter=1.5 * mm
        ),
        'bullet': ParagraphStyle(
            'bullet', fontName=FONT_LIGHT, fontSize=9.5,
            textColor=BODY_TEXT, leading=13,
            leftIndent=6 * mm, spaceAfter=1.2 * mm
        ),
        'caption': ParagraphStyle(
            'caption', fontName=FONT_LIGHT, fontSize=8,
            textColor=HexColor('#999999'), leading=11, spaceAfter=2 * mm
        ),
        'disclaimer_header': ParagraphStyle(
            'disclaimer_header', fontName=FONT_BOLD, fontSize=9,
            textColor=black, leading=12,
            spaceBefore=3 * mm, spaceAfter=1.5 * mm
        ),
        'disclaimer': ParagraphStyle(
            'disclaimer', fontName=FONT_LIGHT, fontSize=8.5,
            textColor=BODY_TEXT, leading=12, spaceAfter=2 * mm,
            alignment=TA_JUSTIFY
        ),
        'disclaimer_bullet': ParagraphStyle(
            'disclaimer_bullet', fontName=FONT_LIGHT, fontSize=8.5,
            textColor=BODY_TEXT, leading=12,
            leftIndent=5 * mm, spaceAfter=1 * mm
        ),
        'cover_brand': ParagraphStyle(
            'cover_brand', fontName=FONT_BOLD, fontSize=9,
            textColor=GREY_HEADER, leading=12, spaceAfter=1 * mm
        ),
        'cover_meta': ParagraphStyle(
            'cover_meta', fontName=FONT_LIGHT, fontSize=9,
            textColor=GREY_HEADER, leading=13, spaceAfter=1 * mm
        ),
        'hyp_name': ParagraphStyle(
            'hyp_name', fontName=FONT_BOLD, fontSize=9.5,
            textColor=black, leading=13
        ),
        'hyp_body': ParagraphStyle(
            'hyp_body', fontName=FONT_LIGHT, fontSize=9,
            textColor=BODY_TEXT, leading=13, spaceAfter=1 * mm
        ),
        'metric_label': ParagraphStyle(
            'metric_label', fontName=FONT_BOLD, fontSize=8,
            textColor=GREY_HEADER, leading=11
        ),
        'metric_value': ParagraphStyle(
            'metric_value', fontName=FONT_BOLD, fontSize=10,
            textColor=black, leading=13
        ),
    }


S = make_styles()


# ── Helpers ──────────────────────────────────────────────────────────────────
def divider():
    return HRFlowable(
        width='100%', thickness=0.5, color=DIVIDER_CLR,
        spaceBefore=2 * mm, spaceAfter=2 * mm
    )


def sentiment_colour(value):
    if value is None:
        return NEUTRAL_CLR
    try:
        v = float(value)
    except (TypeError, ValueError):
        return NEUTRAL_CLR
    if v > 8:
        return BULLISH
    if v < -8:
        return BEARISH
    return NEUTRAL_CLR


def sentiment_label(value):
    if value is None:
        return 'NEUTRAL'
    try:
        v = float(value)
    except (TypeError, ValueError):
        return 'NEUTRAL'
    if v > 25:
        return 'STRONG UPSIDE'
    if v > 8:
        return 'UPSIDE'
    if v > -8:
        return 'NEUTRAL'
    if v > -25:
        return 'DOWNSIDE'
    return 'STRONG DOWNSIDE'


def hyp_colour_by_inconsistency(weighted_inconsistency):
    """
    Colour a hypothesis badge by weighted inconsistency (ACH methodology).
    Lower inconsistency = dominant = green.
    """
    if weighted_inconsistency is None:
        return NEUTRAL_CLR
    try:
        wi = float(weighted_inconsistency)
    except (TypeError, ValueError):
        return NEUTRAL_CLR
    if wi <= 2:
        return BULLISH     # low inconsistency = dominant narrative = green
    if wi <= 4:
        return NEUTRAL_CLR # medium inconsistency = amber
    return BEARISH         # high inconsistency = bearish/unlikely = red


def fmt_pct(v, decimals=1):
    """Format a decimal (e.g. 0.0324) as percentage string (3.2%)."""
    if v is None:
        return 'N/A'
    try:
        return f'{float(v) * 100:.{decimals}f}%'
    except (TypeError, ValueError):
        return 'N/A'


def fmt_change(v):
    """Format a decimal change (e.g. 0.0324) as +3.2%."""
    if v is None:
        return 'N/A'
    try:
        pct = float(v) * 100
        sign = '+' if pct >= 0 else ''
        return f'{sign}{pct:.1f}%'
    except (TypeError, ValueError):
        return 'N/A'


def truncate_words(text, max_words):
    """Trim text to at most max_words words."""
    if not text:
        return ''
    words = text.split()
    if len(words) <= max_words:
        return text
    return ' '.join(words[:max_words]) + '...'


def safe_str(v, default='Pending'):
    if v is None or v == '':
        return default
    return str(v)


def tbl_cell(text, bold=False, align=TA_LEFT, color=None, font_size=9, italic=False):
    """Wrap text in a Paragraph suitable for a table cell."""
    style = ParagraphStyle(
        'tc',
        fontName=FONT_BOLD if bold else FONT_LIGHT,
        fontSize=font_size,
        textColor=color or BODY_TEXT,
        leading=font_size + 3,
        alignment=align,
    )
    return Paragraph(str(text) if text is not None else '', style)


def std_table_style(extra=None):
    base = [
        ('FONT',        (0, 0), (-1,  0), FONT_BOLD,  9),
        ('FONT',        (0, 1), (-1, -1), FONT_LIGHT, 9),
        ('BACKGROUND',  (0, 0), (-1,  0), TBL_FILL),
        ('TEXTCOLOR',   (0, 0), (-1, -1), BODY_TEXT),
        ('GRID',        (0, 0), (-1, -1), 0.25, DIVIDER_CLR),
        ('TOPPADDING',  (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING',(0, 0),(-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING',(0, 0), (-1, -1), 4),
        ('VALIGN',      (0, 0), (-1, -1), 'TOP'),
    ]
    if extra:
        base.extend(extra)
    return TableStyle(base)


# ── Synthesis Helpers (Densification Logic) ────────────────────────────────
def sanitise_prose(text):
    """Strip LLM artefacts: em-dashes, HTML, markdown, double spaces."""
    if not text:
        return text
    import re
    s = re.sub(r'<[^>]+>', '', text)           # HTML tags
    s = s.replace('\u2014', '; ')               # em-dash
    s = s.replace('\u2013', ', ')               # en-dash
    s = s.replace('--', '; ')                   # double-hyphen
    s = re.sub(r'\*\*([^*]+)\*\*', r'\1', s)   # bold markers
    s = re.sub(r'\*([^*]+)\*', r'\1', s)        # italic markers
    s = re.sub(r'^#+\s*', '', s, flags=re.MULTILINE)  # heading markers
    s = re.sub(r'\s{2,}', ' ', s).strip()
    return s


def synthesize_milestones(hyp_label, what_to_watch):
    """Generate a 3-item checklist of what to watch for a hypothesis."""
    milestones = []
    if what_to_watch and len(what_to_watch) > 20:
        # Split on sentence boundaries and use the first two meaningful sentences
        sentences = [s.strip() for s in what_to_watch.split('.') if len(s.strip()) > 10]
        if sentences:
            milestones.append(f"{sentences[0]}.")
        if len(sentences) > 1:
            milestones.append(f"{sentences[1]}.")
    else:
        milestones.append(f"Confirm execution of {hyp_label} milestones.")

    milestones.append("Cross-reference price signal divergence with evidence weight.")
    if len(milestones) < 3:
        milestones.append("Audit incoming evidence for contradictory diagnosticity (ACH-3).")
    return milestones[:3]


def get_regime_commentary(external_sig):
    """Synthesize a qualitative paragraph on the macro/sector regime."""
    label = sentiment_label(external_sig).lower()
    score = int(external_sig) if isinstance(external_sig, (int, float)) else 0

    if score > 15:
        return (f"The current environment reflects a strong tailwind regime ({score:+d}). "
                "Market dynamics are highly supportive of growth narratives, suggesting "
                "lower friction for positive earnings surprises and multiple expansion.")
    if score > 5:
        return (f"We observe an constructive regime ({score:+d}). While not in a full supercycle, "
                "the macro and sector indicators are trending favorably, providing a baseline "
                "level of support for established narratives.")
    if score < -15:
        return (f"The regime is currently in a high-friction state ({score:+d}). "
                "Bearish signals across macro and sector aggregates suggest that even "
                "positive company-specific news may struggle to gain traction in the near term.")
    if score < -5:
        return (f"A cautious regime is currently in place ({score:+d}). Macro headwinds are "
                "present, requiring higher-than-average idiosyncratic proof to sustain bullish narratives.")

    return ("The regime is currently in a neutral transition phase. Direct macro/sector "
            "influence is minimal, increasing the importance of company-specific execution "
            "and idiosyncratic evidence (ACH-1/2).")


def get_coverage_status(stock):
    """Synthesize a status update for stocks with missing financials."""
    ticker = stock.get('ticker', 'N/A')
    industry = stock.get('gics_sub_industry', stock.get('sector', 'Industrials'))
    return (f"Coverage of {ticker} is currently in Phase 1 (Baseline Ingest). "
            f"As a provider in the {industry} sector, we are prioritising "
            "narrative weight assessment and signal divergence tracking while "
            "detailed financial history is being audited.")


# ── Header / Footer canvas callback ──────────────────────────────────────────
def make_header_footer(ticker_ax, report_date):
    """Return a canvas callback that draws header + footer on every page."""
    def _draw(canvas, doc):
        canvas.saveState()
        # ── Footer (all pages) ──────────────────────────────────────────────
        canvas.setFont(FONT_REG, 8)
        canvas.setFillColor(GREY_HEADER)
        canvas.drawString(MARGIN_L, 10 * mm,
                          'Confidential | For Discussion Purposes Only')
        canvas.drawCentredString(PAGE_W / 2, 10 * mm, str(doc.page))
        canvas.drawRightString(PAGE_W - MARGIN_R, 10 * mm, report_date)
        canvas.setStrokeColor(DIVIDER_CLR)
        canvas.setLineWidth(0.5)
        canvas.line(MARGIN_L, 12 * mm, PAGE_W - MARGIN_R, 12 * mm)

        # ── Header (skip page 1 – cover) ────────────────────────────────────
        if doc.page > 1:
            canvas.setFont(FONT_REG, 8)
            canvas.setFillColor(GREY_HEADER)
            canvas.drawString(MARGIN_L, PAGE_H - 9 * mm, 'DH Capital Partners')
            canvas.drawRightString(
                PAGE_W - MARGIN_R, PAGE_H - 9 * mm,
                f'{ticker_ax} | Narrative Intelligence'
            )
            canvas.setStrokeColor(DIVIDER_CLR)
            canvas.setLineWidth(0.5)
            canvas.line(MARGIN_L, PAGE_H - 11 * mm,
                        PAGE_W - MARGIN_R, PAGE_H - 11 * mm)

        canvas.restoreState()

    return _draw


# ── Data loading ─────────────────────────────────────────────────────────────
def load_data(ticker_bare, base_dir):
    """Load stock JSON and macro-factors. Return (stock, macro)."""
    stock_path = base_dir / 'data' / 'stocks' / f'{ticker_bare}.json'
    macro_path = base_dir / 'data' / 'macro-factors.json'

    if not stock_path.exists():
        raise FileNotFoundError(f'Stock JSON not found: {stock_path}')

    with open(stock_path, encoding='utf-8') as f:
        stock = json.load(f)

    macro = {}
    if macro_path.exists():
        with open(macro_path, encoding='utf-8') as f:
            macro = json.load(f)

    return stock, macro


# ── Hypothesis ordering (ACH-correct) ────────────────────────────────────────
def sorted_hypotheses(stock):
    """
    Return list of (key, hyp_dict, is_dominant) sorted by weighted_inconsistency
    ascending (ACH methodology: fewest inconsistencies = dominant).
    Falls back to survival_score descending if inconsistency not present.
    """
    hyps = stock.get('hypotheses', {})
    dominant_key = stock.get('dominant', '')
    items = []
    for k, v in hyps.items():
        if isinstance(v, dict):
            items.append((k, v))

    # Sort: dominant first, then by weighted_inconsistency ascending
    def sort_key(item):
        k, v = item
        if k == dominant_key:
            return (-1, 0)  # always first
        wi = v.get('weighted_inconsistency')
        if wi is not None:
            try:
                return (0, float(wi))
            except (TypeError, ValueError):
                pass
        # Fallback: sort by survival_score descending (negate for ascending sort)
        score = v.get('survival_score', 0)
        try:
            return (0, -float(score))
        except (TypeError, ValueError):
            return (0, 0)

    items.sort(key=sort_key)
    return items


# ══════════════════════════════════════════════════════════════════════════════
# PAGE 1: Cover
# ══════════════════════════════════════════════════════════════════════════════
def build_cover(stock, macro, report_date):
    story = []

    ticker_ax  = stock.get('ticker', 'UNKNOWN')
    company    = stock.get('company', 'Unknown Company')
    sector     = stock.get('sector', 'Pending')
    gics       = stock.get('gics_sub_industry', 'Pending')
    price      = stock.get('current_price')
    mkt_cap    = stock.get('market_cap')

    tls = stock.get('three_layer_signal', {})
    overall      = tls.get('overall_sentiment')
    # External Environment = macro + sector contribution combined
    external_sig = tls.get('external_signal')  # pre-computed in the signal engine
    company_sig  = tls.get('company_contribution')

    # Brand header
    story.append(Spacer(1, 2 * mm))
    story.append(Paragraph('DH Capital Partners', S['cover_brand']))
    story.append(Paragraph('Narrative Intelligence | Equity Research', S['cover_meta']))
    story.append(divider())

    # Company title
    story.append(Spacer(1, 2 * mm))
    story.append(Paragraph(company, S['cover_title']))

    ticker_line = f"{ticker_ax} | {sector}"
    if gics and gics != sector:
        ticker_line += f" | {gics}"
    story.append(Paragraph(ticker_line, S['cover_sub']))
    story.append(divider())

    # ── Key Metrics table (2 rows × 4 cols) ──────────────────────────────────
    story.append(Paragraph('KEY METRICS', S['section_header']))

    if price is not None:
        try:
            price_str = f'A${float(price):,.2f}'
        except (TypeError, ValueError):
            price_str = f'A${price}'
    else:
        price_str = 'Pending'

    cap_str = f'A${mkt_cap}' if mkt_cap else 'Pending'

    # identity block (many stocks don't have it yet -- show Pending)
    identity = stock.get('identity', {}) or {}
    pe_str   = safe_str(identity.get('forward_pe'), 'Pending')
    ev_str   = safe_str(identity.get('ev_ebitda'),  'Pending')
    wk52_lo  = identity.get('week52_low')
    wk52_hi  = identity.get('week52_high')
    if wk52_lo and wk52_hi:
        try:
            wk52_str = f'A${float(wk52_lo):.2f} - A${float(wk52_hi):.2f}'
        except (TypeError, ValueError):
            wk52_str = f'{wk52_lo} - {wk52_hi}'
    else:
        wk52_str = 'Pending'
    div_str  = safe_str(identity.get('div_yield'),  'Pending')
    rev_str  = safe_str(identity.get('revenue'),    'Pending')
    npat_str = safe_str(identity.get('npat'),       'Pending')

    metrics_data = [
        [tbl_cell('Price', bold=True, font_size=8),
         tbl_cell('Mkt Cap', bold=True, font_size=8),
         tbl_cell('Fwd P/E', bold=True, font_size=8),
         tbl_cell('EV/EBITDA', bold=True, font_size=8)],
        [tbl_cell(price_str), tbl_cell(cap_str), tbl_cell(pe_str), tbl_cell(ev_str)],
        [tbl_cell('52wk Range', bold=True, font_size=8),
         tbl_cell('Div Yield', bold=True, font_size=8),
         tbl_cell('Revenue', bold=True, font_size=8),
         tbl_cell('NPAT', bold=True, font_size=8)],
        [tbl_cell(wk52_str), tbl_cell(div_str), tbl_cell(rev_str), tbl_cell(npat_str)],
    ]

    col_w = BODY_W / 4
    metrics_tbl = Table(
        metrics_data,
        colWidths=[col_w] * 4,
        style=std_table_style([
            # No background headers here, using font weight and size in tbl_cell
            ('BACKGROUND', (0, 0), (-1, -1), white),
            ('GRID', (0, 0), (-1, -1), 0.25, DIVIDER_CLR),
        ])
    )
    story.append(metrics_tbl)

    # Densification: Add Coverage Note if financials are missing
    if pe_str == 'Pending' or rev_str == 'Pending':
        story.append(Spacer(1, 1 * mm))
        story.append(Paragraph(get_coverage_status(stock), S['caption']))

    story.append(divider())

    # ── Sentiment block ───────────────────────────────────────────────────────
    story.append(Paragraph('OVERALL SENTIMENT', S['section_header']))

    sent_color = sentiment_colour(overall)
    sent_lbl   = sentiment_label(overall)
    overall_val = f'{int(overall):+d}' if isinstance(overall, (int, float)) else 'N/A'

    # Format external and company signals
    ext_val = f'{int(external_sig):+d}' if isinstance(external_sig, (int, float)) else 'N/A'
    coy_val = f'{int(company_sig):+d}' if isinstance(company_sig, (int, float)) else 'N/A'

    sent_data = [
        [
            tbl_cell('Overall Sentiment', bold=True),
            tbl_cell(f'{overall_val}  {sent_lbl}', color=sent_color, bold=True),
        ],
        [
            tbl_cell('External Environment'),
            tbl_cell(ext_val, color=sentiment_colour(external_sig)),
        ],
        [
            tbl_cell('Company Research'),
            tbl_cell(coy_val, color=sentiment_colour(company_sig)),
        ],
    ]
    sent_tbl = Table(
        sent_data,
        colWidths=[BODY_W * 0.55, BODY_W * 0.45],
        style=std_table_style()
    )
    story.append(sent_tbl)
    story.append(divider())

    # ── Key takeaways ─────────────────────────────────────────────────────────
    story.append(Paragraph('KEY TAKEAWAYS', S['section_header']))
    hyps = sorted_hypotheses(stock)
    dominant_hyp = hyps[0][1] if hyps else {}
    dominant_key_val = hyps[0][0] if hyps else 'D1'
    dom_prob_str = fmt_pct(dominant_hyp.get('survival_score'))

    big_picture  = stock.get('big_picture', '')
    t1_desc      = dominant_hyp.get('plain_english', dominant_hyp.get('description', ''))
    t1_risk      = dominant_hyp.get('risk_plain', '')

    # Takeaway 1: dominant narrative summary
    tk1 = (f"The {dominant_key_val} narrative ('{dominant_hyp.get('label', 'Pending')}') "
           f"currently dominates the valuation math with {dom_prob_str} probability. "
           f"Evidence suggests: {truncate_words(t1_desc, 30)}")

    # Takeaway 2: idiosyncratic execution
    tk2 = (f"Risk profiling for {stock.get('ticker')} prioritises {t1_risk or 'execution stability'}. "
           f"We are monitoring {dominant_hyp.get('what_to_watch', 'next earnings')} as the primary "
           "diagnostic milestone for narrative survival (ACH-2).")

    # Takeaway 3: macro/sector context paragraph
    if isinstance(external_sig, (int, float)):
        context_lbl = sentiment_label(external_sig).lower()
        tk3 = (f"Market-wide regime is {context_lbl} (score: {int(external_sig):+d}). "
               f"External signals are { 'enhancing' if external_sig > 0 else 'dampening' } "
               f"the {sector} sector's baseline trajectory.")
    else:
        tk3 = "Macro context update pending. Monitoring RBA cash rate and sector-specific volume signals."

    for bullet in [tk1, tk2, tk3]:
        story.append(Paragraph(f"- {bullet}", S['bullet']))

    story.append(divider())

    # Author / date
    story.append(Paragraph('Marc Duncan | DH Capital Partners', S['cover_meta']))
    story.append(Paragraph('marc@dhcapital.com.au', S['cover_meta']))
    story.append(Paragraph(f'{report_date} | Sydney', S['cover_meta']))

    story.append(PageBreak())
    return story


# ══════════════════════════════════════════════════════════════════════════════
# PAGE 2: Company Identity and Narrative
# ══════════════════════════════════════════════════════════════════════════════
def build_identity_page(stock, macro):
    story = []

    identity    = stock.get('identity', {}) or {}
    big_picture = stock.get('big_picture', '')
    narrative   = stock.get('narrative', {}) or {}
    nat_summary = narrative.get('summary', big_picture)

    # Use big_picture as company overview if identity.description missing
    overview_text = identity.get('description', big_picture)
    if not overview_text or len(overview_text) < 50:
        overview_text = (overview_text or "") + " " + get_coverage_status(stock)
    overview_text = sanitise_prose(truncate_words(overview_text, 250))

    narrative_text = sanitise_prose(truncate_words(nat_summary or 'Narrative assessment pending.', 200))

    # ── Company Overview ─────────────────────────────────────────────────────
    story.append(Paragraph('COMPANY OVERVIEW', S['section_header']))
    story.append(Paragraph(overview_text, S['body']))
    story.append(divider())

    # ── Narrative Assessment ─────────────────────────────────────────────────
    story.append(Paragraph('NARRATIVE ASSESSMENT', S['section_header']))
    story.append(Paragraph(narrative_text, S['body']))
    
    # Densification: Add evidence-based expansion if narrative is thin
    if len(narrative_text) < 300:
        evidence_items = stock.get('evidence_items', [])
        active_evidence = [e for e in evidence_items if e.get('active', True)][:3]
        if active_evidence:
            evidence_lines = '; '.join(
                f"{e.get('date', '')[:10]}: {e.get('summary', 'N/A')[:80]}"
                for e in active_evidence
            )
            expansion = (f"Key evidence informing current assessment: {evidence_lines}. "
                         f"Hypothesis survival scores are updated via Bayesian weighting of "
                         f"{len(active_evidence)} active evidence items with epistemic credibility "
                         f"and time-decay adjustments.")
        else:
            expansion = (f"Coverage for {stock.get('ticker')} is in the evidence accumulation phase. "
                         "Hypothesis survival scores will sharpen as earnings releases, regulatory "
                         "filings, and operational data provide diagnostically weighted evidence.")
        story.append(Paragraph(expansion, S['body']))

    story.append(divider())

    # ── Market Context ───────────────────────────────────────────────────────
    story.append(Paragraph('MARKET CONTEXT', S['section_header']))

    tls = stock.get('three_layer_signal', {})
    external_sig = tls.get('external_signal', 0)

    # Macro environment data
    rates   = macro.get('rates', {})
    fx      = macro.get('fx', {})
    mkt     = macro.get('market', {})

    asx200  = mkt.get('asx200', {})
    asx_val = asx200.get('close')
    asx_chg = asx200.get('change_20d')

    aud_usd = fx.get('aud_usd', {})
    aud_val = aud_usd.get('close')
    aud_chg = aud_usd.get('change_5d')

    rba_rate = rates.get('rba_cash')
    rba_traj = str(rates.get('rba_trajectory', 'stable')).replace('_', ' ')

    vix     = mkt.get('vix', {})
    vix_val = vix.get('close')

    macro_env_label = sentiment_label(external_sig)

    ctx_data = [
        [tbl_cell('Indicator', bold=True), tbl_cell('Value', bold=True), tbl_cell('Change', bold=True)],
        [tbl_cell('ASX 200'),
         tbl_cell(f'{asx_val:,.1f}' if asx_val else 'N/A'),
         tbl_cell(fmt_change(asx_chg) + ' 1mo' if asx_chg is not None else 'N/A')],
        [tbl_cell('AUD/USD'),
         tbl_cell(f'{aud_val:.4f}' if aud_val else 'N/A'),
         tbl_cell(fmt_change(aud_chg) + ' 5d' if aud_chg is not None else 'N/A')],
        [tbl_cell('RBA Cash Rate'),
         tbl_cell(f'{rba_rate:.2f}%' if rba_rate else 'N/A'),
         tbl_cell(rba_traj)],
        [tbl_cell('VIX'),
         tbl_cell(f'{vix_val:.1f}' if vix_val else 'N/A'),
         tbl_cell('')],
    ]
    ctx_tbl = Table(
        ctx_data,
        colWidths=[BODY_W * 0.4, BODY_W * 0.3, BODY_W * 0.3],
        style=std_table_style()
    )
    story.append(Paragraph(
        f'Macro Environment: {macro_env_label} (external signal: '
        f'{int(external_sig):+d})' if isinstance(external_sig, (int, float))
        else 'Macro Environment: Pending',
        S['body_left']
    ))
    story.append(ctx_tbl)
    
    # Densification: Add Regime Commentary
    story.append(Spacer(1, 1 * mm))
    story.append(Paragraph(get_regime_commentary(external_sig), S['body']))
    
    story.append(Spacer(1, 2 * mm))

    # Sector context
    story.append(Paragraph('SECTOR CONTEXT', S['sub_header']))
    sector_detail = tls.get('sector_detail', {})
    sector_sig    = tls.get('sector_signal', 0)
    sector_desc   = str(sector_detail.get('detail', 'company_dominant')).replace('_', ' ')

    story.append(Paragraph(
        f'Model: {str(stock.get("narrative_model", "N/A")).replace("_", " ")}  |  '
        f'Sector signal: {sector_sig:+d} ({sector_desc})',
        S['body_left']
    ))

    # Commodity overlay (if applicable)
    commodity = stock.get('commodity_overlay')
    if commodity and isinstance(commodity, dict):
        commodities = macro.get('commodities', {})
        comm_data = [[tbl_cell('Commodity', bold=True),
                      tbl_cell('Price', bold=True),
                      tbl_cell('5d Change', bold=True)]]
        primary = commodity.get('primary_commodity', '')
        # Show primary commodity plus up to 2 others
        comm_keys = [primary] if primary else []
        for k in ['iron_ore_62', 'gold_usd', 'copper', 'brent']:
            if k not in comm_keys:
                comm_keys.append(k)
        for key in comm_keys[:4]:
            c = commodities.get(key, {})
            if c:
                unit = c.get('unit', '')
                close_val = c.get('close')
                if close_val:
                    try:
                        price_display = f'{float(close_val):,.2f} {unit}'
                    except (TypeError, ValueError):
                        price_display = f'{close_val} {unit}'
                else:
                    price_display = 'N/A'
                comm_data.append([
                    tbl_cell(key.replace('_', ' ').title()),
                    tbl_cell(price_display),
                    tbl_cell(fmt_change(c.get('change_5d'))),
                ])
        if len(comm_data) > 1:
            story.append(Spacer(1, 1 * mm))
            story.append(Paragraph('Commodity Overlay', S['sub_header']))
            story.append(Table(
                comm_data,
                colWidths=[BODY_W * 0.4, BODY_W * 0.35, BODY_W * 0.25],
                style=std_table_style()
            ))

    story.append(PageBreak())
    return story


# ══════════════════════════════════════════════════════════════════════════════
# PAGE 3: Competing Hypotheses
# ══════════════════════════════════════════════════════════════════════════════
def build_hypotheses_page(stock):
    story = []
    hyps = sorted_hypotheses(stock)
    dominant_field = stock.get('dominant', '')

    story.append(Paragraph('STOCK DRIVERS', S['section_header']))

    if hyps:
        dom_key, dom_hyp = hyps[0]
        dom_score = float(dom_hyp.get('survival_score', 0))
        dom_wi    = dom_hyp.get('weighted_inconsistency')
        dom_label = dom_hyp.get('label', '')
        story.append(Paragraph(
            f'Dominant Narrative: {dom_key}: {dom_label}  '
            f'(survival probability: {dom_score * 100:.0f}%)',
            S['body_left']
        ))

    story.append(divider())

    evidence_items = stock.get('evidence_items', []) or []

    for i, (key, hyp) in enumerate(hyps):
        score  = float(hyp.get('survival_score', 0))
        wi     = hyp.get('weighted_inconsistency')
        is_dominant = (key == dominant_field or i == 0)

        # Hypothesis header row with score badge
        badge_colour = hyp_colour_by_inconsistency(wi)
        label_text = f'{key}: {hyp.get("label", "")}'
        if is_dominant:
            label_text += '  [DOMINANT]'
        score_text = f'{score * 100:.0f}%'

        hdr_data = [[
            tbl_cell(label_text, bold=True, font_size=10, color=badge_colour if is_dominant else None),
            tbl_cell(score_text, bold=True, align=TA_RIGHT,
                     color=badge_colour, font_size=10),
        ]]
        hdr_tbl = Table(
            hdr_data,
            colWidths=[BODY_W * 0.78, BODY_W * 0.22],
            style=TableStyle([
                ('FONT',    (0, 0), (-1, -1), FONT_BOLD, 10),
                ('VALIGN',  (0, 0), (-1, -1), 'MIDDLE'),
                ('TOPPADDING', (0, 0), (-1, -1), 2),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
                ('LEFTPADDING', (0, 0), (-1, -1), 0),
                ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ])
        )
        story.append(hdr_tbl)

        # Description
        desc = sanitise_prose(hyp.get('plain_english') or hyp.get('description', ''))
        if desc:
            story.append(Paragraph(desc, S['hyp_body']))

        # What to watch
        what = sanitise_prose(hyp.get('what_to_watch', ''))
        if what:
            story.append(Paragraph(f'Watch: {truncate_words(what, 40)}', S['hyp_body']))

        # Evidence bullets from evidence_items
        supporting = [e for e in evidence_items
                      if e.get('hypothesis_impact', {}).get(key) == 'CONSISTENT'
                      and e.get('active', True)]
        contradicting = [e for e in evidence_items
                         if e.get('hypothesis_impact', {}).get(key) == 'INCONSISTENT'
                         and e.get('active', True)]

        # Bullet limits per spec: dominant gets 3+2, others get 2+1
        sup_limit  = 3 if is_dominant else 2
        con_limit  = 2 if is_dominant else 1

        if supporting:
            story.append(Paragraph('Supporting evidence:', S['hyp_body']))
            for ev in supporting[:sup_limit]:
                ev_type = ev.get('type', '').replace('_', ' ').title()
                ev_summ = ev.get('summary', '')
                story.append(Paragraph(
                    f'- {ev_type}: {ev_summ}',
                    S['bullet']
                ))

        if contradicting:
            story.append(Paragraph('Contradicting evidence:', S['hyp_body']))
            for ev in contradicting[:con_limit]:
                ev_type = ev.get('type', '').replace('_', ' ').title()
                ev_summ = ev.get('summary', '')
                story.append(Paragraph(
                    f'- {ev_type}: {ev_summ}',
                    S['bullet']
                ))

        if not supporting and not contradicting:
            story.append(Paragraph('Diagnostic milestones (synthesized):', S['hyp_body']))
            milestones = synthesize_milestones(hyp.get('label', 'target'), what)
            for m in milestones:
                story.append(Paragraph(f'- {m}', S['bullet']))

        if i < len(hyps) - 1:
            story.append(divider())

    story.append(PageBreak())
    return story


# ══════════════════════════════════════════════════════════════════════════════
# PAGE 4: Evidence Matrix and Discriminators
# ══════════════════════════════════════════════════════════════════════════════
def build_evidence_page(stock):
    story = []
    evidence_items = stock.get('evidence_items', []) or []
    hyps = sorted_hypotheses(stock)
    hyp_keys = [k for k, _ in hyps]

    # ── Diagnostic Evidence Matrix ────────────────────────────────────────────
    story.append(Paragraph('DIAGNOSTIC EVIDENCE', S['section_header']))
    story.append(Paragraph(
        'The following evidence items have the highest discriminating power '
        'between hypotheses:',
        S['body_left']
    ))

    if evidence_items:
        # Sort by diagnosticity: CRITICAL first, then HIGH, MEDIUM, LOW
        diag_order = {'CRITICAL': 0, 'HIGH': 1, 'MEDIUM': 2, 'LOW': 3}
        sorted_ev = sorted(
            [e for e in evidence_items if e.get('active', True)],
            key=lambda x: diag_order.get(x.get('diagnosticity', 'LOW'), 3)
        )[:8]  # top 8

        # Header row
        ev_header = ['Evidence Item'] + hyp_keys + ['Diagnosticity']
        ev_data = [ev_header]
        for ev in sorted_ev:
            impact = ev.get('hypothesis_impact', {})
            impact_map = {'CONSISTENT': 'C', 'INCONSISTENT': 'I', 'NEUTRAL': 'N'}
            row = [tbl_cell(truncate_words(ev.get('summary', ''), 10), font_size=8)]
            for k in hyp_keys:
                raw = impact.get(k, 'N')
                mapped = impact_map.get(raw, 'N')
                # Colour C/I/N appropriately
                cell_colour = None
                if mapped == 'C':
                    cell_colour = BULLISH
                elif mapped == 'I':
                    cell_colour = BEARISH
                row.append(tbl_cell(mapped, align=TA_CENTER, font_size=8, color=cell_colour))
            diag = ev.get('diagnosticity', 'N/A')
            diag_colour = BULLISH if diag in ('HIGH', 'CRITICAL') else (NEUTRAL_CLR if diag == 'MEDIUM' else None)
            row.append(tbl_cell(diag, bold=True, font_size=8, color=diag_colour))
            ev_data.append(row)

        n_hyps = len(hyp_keys)
        item_w = BODY_W * 0.42
        hyp_w  = (BODY_W * 0.36) / max(n_hyps, 1)
        diag_w = BODY_W * 0.22

        ev_tbl = Table(
            ev_data,
            colWidths=[item_w] + [hyp_w] * n_hyps + [diag_w],
            style=std_table_style()
        )
        story.append(ev_tbl)
    else:
        # Densification: Diagnostic Framework Table
        story.append(Paragraph(
            'DIAGNOSTIC FRAMEWORK: What evidence would shift the narrative?',
            S['sub_header']
        ))
        story.append(Paragraph(
            'In the absence of active evidence items, we evaluate hypotheses against '
            'the following diagnostic benchmarks:',
            S['body_left']
        ))
        framework_data = [['Hypothesis', 'Validating Signal', 'Invalidating Signal']]
        for key, hyp in hyps[:4]:
            what = hyp.get('what_to_watch', 'market data')
            framework_data.append([
                tbl_cell(key, bold=True),
                tbl_cell(f"Support for {truncate_words(what, 8)}"),
                tbl_cell(f"Contradiction of {truncate_words(hyp.get('label','targets'), 5)}")
            ])
        story.append(Table(
            framework_data,
            colWidths=[BODY_W * 0.2, BODY_W * 0.4, BODY_W * 0.4],
            style=std_table_style()
        ))

    story.append(Spacer(1, 1 * mm))
    story.append(Paragraph(
        'C = Consistent, I = Inconsistent, N = Neutral. '
        'Diagnosticity = ability to discriminate between hypotheses. '
        'HIGH/CRITICAL items are most informative.',
        S['caption']
    ))
    story.append(divider())

    # ── Key Discriminators ────────────────────────────────────────────────────
    story.append(Paragraph('KEY DISCRIMINATORS', S['section_header']))

    discriminates = stock.get('discriminates', []) or []
    if discriminates:
        for d in discriminates[:4]:
            title = d.get('title', d.get('name', ''))
            desc  = d.get('description', d.get('detail', ''))
            if title:
                story.append(Paragraph(f'{title}:', S['sub_header']))
            if desc:
                story.append(Paragraph(desc, S['body_left']))
    else:
        # Derive discriminators from HIGH diagnosticity evidence items
        high_items = [e for e in evidence_items
                      if e.get('diagnosticity') in ('CRITICAL', 'HIGH')
                      and e.get('active', True)]
        if high_items:
            story.append(Paragraph(
                'The following high-diagnosticity evidence items are most '
                'informative for discriminating between hypotheses:',
                S['body_left']
            ))
            for ev in high_items[:3]:
                impact = ev.get('hypothesis_impact', {})
                consistent_with = [k for k, v in impact.items() if v == 'CONSISTENT']
                inconsistent_with = [k for k, v in impact.items() if v == 'INCONSISTENT']
                detail = ev.get('summary', '')
                if consistent_with or inconsistent_with:
                    detail += f' (Supports: {", ".join(consistent_with) or "none"}; Contradicts: {", ".join(inconsistent_with) or "none"})'
                story.append(Paragraph(
                    f'- {detail}',
                    S['bullet']
                ))
        else:
            story.append(Paragraph(
                'Key discriminator analysis pending - '
                'will be populated as evidence items are assessed.',
                S['body_left']
            ))

    story.append(divider())

    # ── Tripwires ─────────────────────────────────────────────────────────────
    story.append(Paragraph('TRIPWIRES', S['section_header']))

    tripwires = stock.get('tripwires', []) or []
    if tripwires:
        tw_data = [['Condition', 'Trigger', 'Action']]
        for tw in tripwires[:4]:
            tw_data.append([
                tbl_cell(tw.get('condition', tw.get('description', 'Pending')), font_size=8),
                tbl_cell(tw.get('trigger',   tw.get('threshold', 'Pending')), font_size=8),
                tbl_cell(tw.get('action',    tw.get('response', 'Pending')), font_size=8),
            ])
        tw_tbl = Table(
            tw_data,
            colWidths=[BODY_W * 0.45, BODY_W * 0.25, BODY_W * 0.30],
            style=std_table_style()
        )
        story.append(tw_tbl)
    else:
        # Derive from hypothesis what_to_watch fields
        hyps_list = sorted_hypotheses(stock)
        tw_data = [['Condition', 'Trigger', 'Action']]
        for key, hyp in hyps_list[:3]:
            what = hyp.get('what_to_watch', '')
            if what:
                tw_data.append([
                    tbl_cell(truncate_words(what, 12), font_size=8),
                    tbl_cell('Per hypothesis thresholds', font_size=8),
                    tbl_cell(f'Reassess {key} narrative', font_size=8),
                ])
        if len(tw_data) > 1:
            tw_tbl = Table(
                tw_data,
                colWidths=[BODY_W * 0.45, BODY_W * 0.25, BODY_W * 0.30],
                style=std_table_style()
            )
            story.append(tw_tbl)
        else:
            story.append(Paragraph('Tripwire conditions pending.', S['body_left']))

    story.append(PageBreak())
    return story


# ══════════════════════════════════════════════════════════════════════════════
# PAGE 5: Technical and Gaps
# ══════════════════════════════════════════════════════════════════════════════
def build_technical_page(stock, base_dir):
    story = []
    ticker_bare = stock.get('ticker', '').replace('.AX', '')

    # ── Technical Picture ────────────────────────────────────────────────────
    story.append(Paragraph('TECHNICAL PICTURE', S['section_header']))

    # Try to load TA signals file
    ta_path = base_dir / 'data' / 'ta-signals' / f'{ticker_bare}.json'
    ta_data = {}
    if ta_path.exists():
        try:
            with open(ta_path, encoding='utf-8') as f:
                ta_data = json.load(f)
        except (json.JSONDecodeError, OSError):
            pass

    # Also check stock's own technical section
    ta_inline = stock.get('technical', {}) or {}
    if ta_inline:
        ta_data = ta_inline

    if ta_data:
        ta_rows = [['Indicator', 'Value', 'Signal']]
        for ind, vals in ta_data.items():
            if isinstance(vals, dict):
                ta_rows.append([
                    tbl_cell(ind),
                    tbl_cell(str(vals.get('value', 'N/A'))),
                    tbl_cell(str(vals.get('signal', 'N/A'))),
                ])
        if len(ta_rows) > 1:
            story.append(Table(
                ta_rows,
                colWidths=[BODY_W * 0.35, BODY_W * 0.25, BODY_W * 0.40],
                style=std_table_style()
            ))
        else:
            story.append(Paragraph(
                'Technical analysis pending - signals will be incorporated '
                'when the TA agent is deployed.',
                S['body_left']
            ))
    else:
        story.append(Paragraph(
            'Technical analysis pending - signals will be incorporated '
            'when the TA agent is deployed.',
            S['body_left']
        ))

    story.append(divider())

    # ── Analytical Gaps ──────────────────────────────────────────────────────
    story.append(Paragraph('ANALYTICAL GAPS', S['section_header']))
    story.append(Paragraph(
        'The following information would materially improve the confidence '
        'of this analysis:',
        S['body_left']
    ))

    gaps = stock.get('gaps', []) or []
    if gaps:
        for gap in gaps[:5]:
            if isinstance(gap, dict):
                text = gap.get('description', gap.get('gap', str(gap)))
            else:
                text = str(gap)
            story.append(Paragraph(f'- {text}', S['bullet']))
    else:
        # Densification: Dynamic Research Agenda for Phase 1 Coverage
        story.append(Paragraph(
            'RESEARCH AGENDA: 90-Day Analytical Objectives', 
            S['sub_header']
        ))
        story.append(Paragraph(
            'As this ticker is in baseline coverage, our primary research agenda '
            'focuses on the following idiosyncratic drivers:',
            S['body_left']
        ))
        default_gaps = [
            f"Management guidance on {stock.get('sector', 'sector')} demand trajectory - "
            "required to validate narrative survival for dominant hypothesis (ACH-1).",
            "Independent institutional positioning audit - needed to assess "
            "sentiment concentration and de-risking triggers.",
            "Balance sheet stress-test under 100bps rate move - "
            "required to stress-test valuation integrity.",
            "Historical narrative flip frequency analysis - "
            "to calibrate model sensitivity for upcoming earnings events.",
        ]
        for g in default_gaps:
            story.append(Paragraph(f'- {g}', S['bullet']))

    story.append(divider())

    # ── Upcoming Catalysts ───────────────────────────────────────────────────
    story.append(Paragraph('UPCOMING CATALYSTS', S['section_header']))

    events = stock.get('events', [])
    if isinstance(events, list) and len(events) > 0:
        ev_data = [['Date', 'Event']]
        # Use explicit slicing on a validated list
        for ev in events[:4]:
            if isinstance(ev, dict):
                ev_data.append([
                    tbl_cell(ev.get('date', 'TBD'), font_size=8),
                    tbl_cell(ev.get('description', ev.get('event', '')), font_size=8),
                ])
        if len(ev_data) > 1:
            story.append(Table(
                ev_data,
                colWidths=[BODY_W * 0.25, BODY_W * 0.75],
                style=std_table_style()
            ))
        else:
            _add_default_catalysts(story, stock)
    else:
        _add_default_catalysts(story, stock)

    story.append(PageBreak())
    return story


def _add_default_catalysts(story, stock):
    """Add default catalyst section when no events are in the stock JSON."""
    story.append(Paragraph(
        'Catalyst calendar pending. Key items to monitor:',
        S['body_left']
    ))
    last_flip = stock.get('last_flip')
    if last_flip and isinstance(last_flip, dict):
        flip_date    = last_flip.get('date', 'N/A')
        flip_trigger = last_flip.get('trigger', '')
        story.append(Paragraph(
            f'- Last narrative event: {flip_date}'
            + (f' - {truncate_words(flip_trigger, 15)}' if flip_trigger else ''),
            S['bullet']
        ))
    story.append(Paragraph(
        '- Next results date: Pending (monitor ASX announcements)',
        S['bullet']
    ))
    story.append(Paragraph(
        '- Monitor hypothesis tripwires for narrative-change signals.',
        S['bullet']
    ))


# ══════════════════════════════════════════════════════════════════════════════
# PAGE 6: Disclaimer
# ══════════════════════════════════════════════════════════════════════════════
def build_disclaimer(stock, report_date):
    story = []

    story.append(Paragraph('IMPORTANT INFORMATION', S['section_header']))
    story.append(Paragraph(
        'This document is prepared by DH Capital Partners Pty Ltd for '
        'informational purposes only. It does not constitute financial '
        'advice, a recommendation, or an offer to buy or sell any '
        'securities.',
        S['disclaimer']
    ))

    story.append(Paragraph('METHODOLOGY', S['disclaimer_header']))
    story.append(Paragraph(
        'This analysis uses the Analysis of Competing Hypotheses (ACH) '
        'framework, originally developed by Richards Heuer at the CIA for '
        'intelligence analysis and adapted here for equity research. ACH '
        'evaluates multiple competing explanations against diagnostic '
        'evidence, ranking hypotheses by the fewest inconsistencies rather '
        'than the most confirmations. This approach is designed to reduce '
        'confirmation bias and anchoring effects common in traditional '
        'equity research.',
        S['disclaimer']
    ))
    story.append(Paragraph(
        'Sentiment scores are generated by a three-layer decomposition '
        'model separating macro environment, sector/commodity factors, and '
        'company-specific research. The 40/60 rule ensures company-specific '
        'research always contributes at least 60% of the overall sentiment, '
        'maintaining focus on idiosyncratic stock drivers.',
        S['disclaimer']
    ))

    story.append(Paragraph('NARRATIVE INTELLIGENCE PHILOSOPHY', S['disclaimer_header']))
    story.append(Paragraph(
        'Our approach is based on the principle that market prices represent '
        'the probability-weighted aggregate of multiple competing stories. '
        'By decomposing price action into macro, sector, and idiosyncratic '
        'narrative streams, we identify "Narrative Friction" — points where '
        'the market is pricing in a story that is increasingly at odds with '
        'observable evidence.',
        S['disclaimer']
    ))
    story.append(Paragraph(
        'In our view, the most profitable opportunities occur when a dominant '
        'narrative becomes "fragile" (high survival score, high inconsistency), '
        'preceding a sharp de-rating or narrative flip.',
        S['disclaimer']
    ))

    story.append(Paragraph('LIMITATIONS', S['disclaimer_header']))
    limitations = [
        'Hypothesis scores are model outputs, not price targets or '
        'investment recommendations.',
        'Evidence assessment involves subjective judgement and may '
        'contain errors.',
        'Past price performance is not indicative of future returns.',
        'This analysis does not account for individual investor '
        'circumstances, risk tolerance, or tax position.',
        'Data sources include ASX announcements, broker research, '
        'company filings, and market data. Errors in source data will '
        'propagate.',
    ]
    for lim in limitations:
        story.append(Paragraph(f'- {lim}', S['disclaimer_bullet']))

    story.append(Paragraph('CONFLICTS', S['disclaimer_header']))
    story.append(Paragraph(
        'DH Capital Partners and/or its principals may hold positions in '
        'securities discussed in this document. Positions may change '
        'without notice.',
        S['disclaimer']
    ))

    story.append(Paragraph('CONTACT', S['disclaimer_header']))
    story.append(Paragraph('Marc Duncan', S['disclaimer']))
    story.append(Paragraph('DH Capital Partners', S['disclaimer']))
    story.append(Paragraph('marc@dhcapital.com.au', S['disclaimer']))
    story.append(Paragraph('Sydney, Australia', S['disclaimer']))

    story.append(divider())
    story.append(Paragraph(
        f'(c) 2026 DH Capital Partners Pty Ltd. All rights reserved.',
        S['disclaimer']
    ))

    return story  # No PageBreak -- this is the final page


# ══════════════════════════════════════════════════════════════════════════════
# Main generator
# ══════════════════════════════════════════════════════════════════════════════
def generate(ticker_bare, base_dir=None):
    if base_dir is None:
        base_dir = Path(__file__).parent.parent

    stock, macro = load_data(ticker_bare, base_dir)
    ticker_ax = stock.get('ticker', f'{ticker_bare}.AX')
    report_date = datetime.now().strftime('%d %B %Y')

    out_dir = base_dir / 'public' / 'reports'
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f'{ticker_bare}-investor-briefing.pdf'

    # Build story
    story = []
    story += build_cover(stock, macro, report_date)
    story += build_identity_page(stock, macro)
    story += build_hypotheses_page(stock)
    story += build_evidence_page(stock)
    story += build_technical_page(stock, base_dir)
    story += build_disclaimer(stock, report_date)

    # Create document
    header_footer_cb = make_header_footer(ticker_ax, report_date)

    doc = SimpleDocTemplate(
        str(out_path),
        pagesize=A4,
        leftMargin=MARGIN_L,
        rightMargin=MARGIN_R,
        topMargin=MARGIN_T,
        bottomMargin=MARGIN_B,
        title=f'{ticker_ax} Investor Briefing',
        author='DH Capital Partners',
        subject='Narrative Intelligence | Equity Research',
    )

    doc.build(story,
              onFirstPage=header_footer_cb,
              onLaterPages=header_footer_cb)

    print(f'Generated: {out_path}')
    return str(out_path)


# ── Page count verification ───────────────────────────────────────────────────
def count_pages(pdf_path):
    """Count pages using simple PDF parser (no extra deps)."""
    with open(pdf_path, 'rb') as f:
        content = f.read()
    import re
    pages = re.findall(rb'/Type\s*/Page[^s]', content)
    return len(pages)


# ── Batch generation ──────────────────────────────────────────────────────────
def generate_all(base_dir):
    """Generate briefings for all stocks in data/stocks/."""
    stocks_dir = base_dir / 'data' / 'stocks'
    tickers = []
    for f in stocks_dir.glob('*.json'):
        if not f.stem.endswith('-history'):
            tickers.append(f.stem)
    tickers.sort()

    results = {'pass': [], 'fail': [], 'wrong_pages': []}
    for ticker in tickers:
        try:
            out = generate(ticker, base_dir)
            pages = count_pages(out)
            if pages == 6:
                results['pass'].append(ticker)
                print(f'  [PASS] {ticker}: {pages} pages')
            else:
                results['wrong_pages'].append((ticker, pages))
                print(f'  [WARN] {ticker}: {pages} pages (expected 6)')
        except Exception as e:
            results['fail'].append((ticker, str(e)))
            print(f'  [FAIL] {ticker}: {e}')

    print(f'\n=== Batch Summary ===')
    print(f'Pass: {len(results["pass"])}  |  Wrong pages: {len(results["wrong_pages"])}  |  Fail: {len(results["fail"])}')
    if results['fail']:
        print('Failures:')
        for t, e in results['fail']:
            print(f'  {t}: {e}')
    return results


# ── CLI entry point ───────────────────────────────────────────────────────────
if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Usage: python scripts/generate-investor-briefing.py TICKER')
        print('       python scripts/generate-investor-briefing.py --all')
        print('Examples:')
        print('  python scripts/generate-investor-briefing.py WOW')
        print('  python scripts/generate-investor-briefing.py BHP')
        sys.exit(1)

    base = Path(__file__).parent.parent

    if sys.argv[1] == '--all':
        generate_all(base)
        sys.exit(0)

    ticker_input = sys.argv[1].upper().replace('.AX', '')

    out = generate(ticker_input, base)

    pages = count_pages(out)
    print(f'Page count: {pages}')
    if pages != 6:
        print(f'WARNING: Expected 6 pages, got {pages}. '
              f'Review content length and adjust.')
    else:
        print('PASS: Exactly 6 pages.')
