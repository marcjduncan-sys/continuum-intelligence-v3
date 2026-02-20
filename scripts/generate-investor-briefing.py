"""
Continuum Intelligence — Investor Briefing PDF Generator
Uses ReportLab Platypus (NOT Canvas drawing).
Spec: INVESTOR_BRIEFING_SPEC.md

Usage:
    python scripts/generate-investor-briefing.py WOW
    python scripts/generate-investor-briefing.py BHP
    python scripts/generate-investor-briefing.py DRO
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
MARGIN_T = 20 * mm   # leaves room for header rule at 10mm
MARGIN_B = 20 * mm   # leaves room for footer rule at 12mm
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
FONT_LIGHT = 'Helvetica'   # Helvetica built-in; no Light variant without TTF


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
            leftIndent=6 * mm, spaceAfter=1 * mm
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


def hyp_colour(score):
    """Colour a hypothesis badge by survival score."""
    if score >= 0.6:
        return BULLISH
    if score >= 0.35:
        return NEUTRAL_CLR
    return BEARISH


def fmt_pct(v, decimals=1):
    """Format a decimal as percentage string."""
    if v is None:
        return 'N/A'
    try:
        return f'{float(v) * 100:.{decimals}f}%'
    except (TypeError, ValueError):
        return 'N/A'


def fmt_change(v):
    """Format a float change with sign."""
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


def tbl_cell(text, bold=False, align=TA_LEFT, color=None, font_size=9):
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


# ── Sorted hypotheses ────────────────────────────────────────────────────────
def sorted_hypotheses(stock):
    """Return list of (key, hyp_dict) sorted by survival_score desc."""
    hyps = stock.get('hypotheses', {})
    items = []
    for k, v in hyps.items():
        if isinstance(v, dict):
            items.append((k, v))
    items.sort(key=lambda x: float(x[1].get('survival_score', 0)), reverse=True)
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
    overall    = tls.get('overall_sentiment')
    macro_sig  = tls.get('macro_contribution')
    company_sig = tls.get('company_contribution')

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

    # Key metrics table (2 rows x 4 cols)
    story.append(Paragraph('KEY METRICS', S['section_header']))

    price_str  = f'A${price:,.2f}' if price is not None else 'Pending'
    cap_str    = f'A${mkt_cap}' if mkt_cap else 'Pending'

    # identity block (many stocks don't have it yet — show Pending)
    identity = stock.get('identity', {}) or {}
    pe_str      = safe_str(identity.get('forward_pe'), 'Pending')
    ev_str      = safe_str(identity.get('ev_ebitda'),  'Pending')
    wk52_lo     = identity.get('week52_low')
    wk52_hi     = identity.get('week52_high')
    wk52_str    = (f'A${wk52_lo:.2f} - A${wk52_hi:.2f}'
                   if wk52_lo and wk52_hi else 'Pending')
    div_str     = safe_str(identity.get('div_yield'),  'Pending')
    rev_str     = safe_str(identity.get('revenue'),    'Pending')
    npat_str    = safe_str(identity.get('npat'),       'Pending')

    def mc(label, val):
        return [tbl_cell(label, bold=True, font_size=8),
                tbl_cell(val,   bold=False, font_size=9)]

    metrics_data = [
        ['Price', 'Mkt Cap', 'Fwd P/E', 'EV/EBITDA'],
        [price_str, cap_str, pe_str, ev_str],
        ['52wk Range', 'Div Yield', 'Revenue', 'NPAT'],
        [wk52_str, div_str, rev_str, npat_str],
    ]

    col_w = BODY_W / 4
    metrics_tbl = Table(
        metrics_data,
        colWidths=[col_w] * 4,
        style=std_table_style([
            ('BACKGROUND', (0, 0), (-1,  0), TBL_FILL),
            ('BACKGROUND', (0, 2), (-1,  2), TBL_FILL),
            ('FONT', (0, 0), (-1, 0), FONT_BOLD, 8),
            ('FONT', (0, 2), (-1, 2), FONT_BOLD, 8),
            ('FONT', (0, 1), (-1, 1), FONT_LIGHT, 9),
            ('FONT', (0, 3), (-1, 3), FONT_LIGHT, 9),
        ])
    )
    story.append(metrics_tbl)
    story.append(divider())

    # Sentiment block
    story.append(Paragraph('OVERALL SENTIMENT', S['section_header']))

    sent_color = sentiment_colour(overall)
    sent_lbl   = sentiment_label(overall)
    overall_val = f'{overall:+d}' if isinstance(overall, (int, float)) else 'N/A'

    sent_data = [
        [
            tbl_cell('Overall Sentiment', bold=True),
            tbl_cell(f'{overall_val}  {sent_lbl}', color=sent_color, bold=True),
        ],
        [
            tbl_cell('External Environment', bold=False),
            tbl_cell(
                f'{macro_sig:+d}' if isinstance(macro_sig, (int, float)) else 'N/A',
                color=sentiment_colour(macro_sig)
            ),
        ],
        [
            tbl_cell('Company Research', bold=False),
            tbl_cell(
                f'{company_sig:+d}' if isinstance(company_sig, (int, float)) else 'N/A',
                color=sentiment_colour(company_sig)
            ),
        ],
    ]
    sent_tbl = Table(
        sent_data,
        colWidths=[BODY_W * 0.55, BODY_W * 0.45],
        style=std_table_style()
    )
    story.append(sent_tbl)
    story.append(divider())

    # Key takeaways — derive from big_picture + dominant hypothesis
    story.append(Paragraph('KEY TAKEAWAYS', S['section_header']))
    hyps = sorted_hypotheses(stock)
    dominant_hyp = hyps[0][1] if hyps else {}
    dominant_key = hyps[0][0] if hyps else 'T1'

    big_picture = stock.get('big_picture', '')
    t1_desc = dominant_hyp.get('plain_english', dominant_hyp.get('description', ''))
    t1_risk = dominant_hyp.get('risk_plain', '')

    # Takeaway 1: dominant narrative
    tk1 = truncate_words(t1_desc, 35) if t1_desc else \
          f'Dominant narrative: {dominant_key} – {dominant_hyp.get("label", "Pending")}.'
    # Takeaway 2: key risk
    tk2 = truncate_words(t1_risk, 35) if t1_risk else \
          'Key risk: monitor execution against current dominant hypothesis thresholds.'
    # Takeaway 3: external context
    macro_label = sentiment_label(macro_sig)
    tk3 = (f'External environment is {macro_label.lower()} '
           f'(score: {macro_sig:+d}). '
           'Macro contribution is incorporated in the three-layer sentiment model.'
           if isinstance(macro_sig, (int, float))
           else 'External environment: pending macro signal update.')

    for bullet in [tk1, tk2, tk3]:
        story.append(Paragraph(f'- {bullet}', S['bullet']))

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

    identity   = stock.get('identity', {}) or {}
    big_picture = stock.get('big_picture', '')
    narrative  = stock.get('narrative', {}) or {}
    nat_summary = narrative.get('summary', big_picture)

    # Use big_picture as company overview if identity.description missing
    overview_text = identity.get('description', big_picture)
    overview_text = truncate_words(overview_text or 'Company overview pending.', 200)

    narrative_text = truncate_words(nat_summary or 'Narrative assessment pending.', 150)

    # ── Company Overview ─────────────────────────────────────────────────────
    story.append(Paragraph('COMPANY OVERVIEW', S['section_header']))
    story.append(Paragraph(overview_text, S['body']))
    story.append(divider())

    # ── Narrative Assessment ─────────────────────────────────────────────────
    story.append(Paragraph('NARRATIVE ASSESSMENT', S['section_header']))
    story.append(Paragraph(narrative_text, S['body']))
    story.append(divider())

    # ── Market Context ───────────────────────────────────────────────────────
    story.append(Paragraph('MARKET CONTEXT', S['section_header']))

    tls = stock.get('three_layer_signal', {})
    macro_sig = tls.get('macro_contribution', 0)

    # Macro environment
    rates = macro.get('rates', {})
    fx    = macro.get('fx', {})
    mkt   = macro.get('market', {})

    asx200  = mkt.get('asx200', {})
    asx_val = asx200.get('close')
    asx_chg = asx200.get('change_20d')

    aud_usd = fx.get('aud_usd', {})
    aud_val = aud_usd.get('close')
    aud_chg = aud_usd.get('change_5d')

    rba_rate = rates.get('rba_cash')
    rba_traj = rates.get('rba_trajectory', 'stable').replace('_', ' ')

    vix = mkt.get('vix', {})
    vix_val = vix.get('close')

    macro_env_label = sentiment_label(macro_sig)

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
        f'Macro Environment: {macro_env_label} (contribution: '
        f'{macro_sig:+d})' if isinstance(macro_sig, (int, float))
        else 'Macro Environment: Pending',
        S['body_left']
    ))
    story.append(ctx_tbl)
    story.append(Spacer(1, 2 * mm))

    # Sector context
    story.append(Paragraph('SECTOR CONTEXT', S['sub_header']))
    sector_detail = tls.get('sector_detail', {})
    sector_sig    = tls.get('sector_signal', 0)
    sector_desc   = sector_detail.get('detail', 'company_dominant').replace('_', ' ')

    story.append(Paragraph(
        f'Model: {stock.get("narrative_model", "N/A").replace("_", " ")} | '
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
        for key in ['iron_ore_62', 'gold_usd', 'copper', 'brent']:
            c = commodities.get(key, {})
            if c:
                comm_data.append([
                    tbl_cell(key.replace('_', ' ').title()),
                    tbl_cell(str(c.get('close', 'N/A'))),
                    tbl_cell(fmt_change(c.get('change_5d'))),
                ])
        if len(comm_data) > 1:
            story.append(Spacer(1, 1 * mm))
            story.append(Paragraph('Commodity Overlay', S['sub_header']))
            story.append(Table(
                comm_data,
                colWidths=[BODY_W * 0.4, BODY_W * 0.3, BODY_W * 0.3],
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

    story.append(Paragraph('COMPETING HYPOTHESES', S['section_header']))

    if hyps:
        dom_key, dom_hyp = hyps[0]
        dom_score = float(dom_hyp.get('survival_score', 0))
        story.append(Paragraph(
            f'Dominant Narrative: {dom_key}: {dom_hyp.get("label", "")}  '
            f'({dom_score * 100:.0f}%)',
            S['body_left']
        ))

    story.append(divider())

    evidence_items = stock.get('evidence_items', []) or []

    for i, (key, hyp) in enumerate(hyps):
        score = float(hyp.get('survival_score', 0))
        is_dominant = (i == 0)

        # Hypothesis header row
        badge_colour = hyp_colour(score)
        label_text = f'{key}: {hyp.get("label", "")}'
        score_text = f'{score * 100:.0f}%'

        hdr_data = [[
            tbl_cell(label_text, bold=True, font_size=10),
            tbl_cell(score_text, bold=True, align=TA_RIGHT,
                     color=badge_colour, font_size=10),
        ]]
        hdr_tbl = Table(
            hdr_data,
            colWidths=[BODY_W * 0.75, BODY_W * 0.25],
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
        desc = hyp.get('plain_english') or hyp.get('description', '')
        if desc:
            story.append(Paragraph(desc, S['hyp_body']))

        # What to watch
        what = hyp.get('what_to_watch', '')
        if what:
            story.append(Paragraph(f'Watch: {what}', S['hyp_body']))

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
                story.append(Paragraph(
                    f'- {ev.get("type", "").replace("_", " ").title()}: '
                    f'{ev.get("summary", "")}',
                    S['bullet']
                ))

        if contradicting:
            story.append(Paragraph('Contradicting evidence:', S['hyp_body']))
            for ev in contradicting[:con_limit]:
                story.append(Paragraph(
                    f'- {ev.get("type", "").replace("_", " ").title()}: '
                    f'{ev.get("summary", "")}',
                    S['bullet']
                ))

        if not supporting and not contradicting:
            story.append(Paragraph(
                '- Evidence gathering in progress.', S['bullet']
            ))

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
        # Sort by diagnosticity: HIGH first, then MEDIUM, then LOW
        diag_order = {'HIGH': 0, 'MEDIUM': 1, 'LOW': 2}
        sorted_ev = sorted(
            [e for e in evidence_items if e.get('active', True)],
            key=lambda x: diag_order.get(x.get('diagnosticity', 'LOW'), 2)
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
                row.append(tbl_cell(impact_map.get(raw, 'N'),
                                    align=TA_CENTER, font_size=8))
            row.append(tbl_cell(ev.get('diagnosticity', 'N/A'),
                                 bold=True, font_size=8))
            ev_data.append(row)

        n_hyps = len(hyp_keys)
        item_w = BODY_W * 0.42
        hyp_w  = (BODY_W * 0.38) / max(n_hyps, 1)
        diag_w = BODY_W * 0.20

        ev_tbl = Table(
            ev_data,
            colWidths=[item_w] + [hyp_w] * n_hyps + [diag_w],
            style=std_table_style()
        )
        story.append(ev_tbl)
    else:
        story.append(Paragraph(
            'Evidence matrix pending — no active evidence items recorded.',
            S['body_left']
        ))

    story.append(Spacer(1, 1 * mm))
    story.append(Paragraph(
        'C = Consistent, I = Inconsistent, N = Neutral. '
        'Diagnosticity = ability to discriminate between hypotheses. '
        'HIGH items are most informative.',
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
        # Derive discriminators from evidence: items where impact varies most
        high_items = [e for e in evidence_items
                      if e.get('diagnosticity') == 'HIGH' and e.get('active', True)]
        if high_items:
            for ev in high_items[:3]:
                story.append(Paragraph(
                    f'- {ev.get("summary", "")} '
                    f'[{ev.get("source", "")}]',
                    S['bullet']
                ))
        else:
            story.append(Paragraph(
                'Key discriminator analysis pending — '
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
        # Derive from hypothesis what_to_watch
        hyps = sorted_hypotheses(stock)
        tw_data = [['Condition', 'Trigger', 'Action']]
        for key, hyp in hyps[:3]:
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
        with open(ta_path, encoding='utf-8') as f:
            ta_data = json.load(f)

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
        # Generate standard gaps from what's missing
        default_gaps = [
            'Management guidance on forward P/E and revenue trajectory — '
            'required to validate Growth/Recovery hypothesis.',
            'Independent market share data — needed to assess competitive '
            'dynamics and test downside scenarios.',
            'Balance sheet composition and net debt position — '
            'required to stress-test valuation under rate scenarios.',
            'Analyst consensus estimates and revision trends — '
            'to calibrate sentiment score against market positioning.',
            'Customer cohort data or NPS trends — '
            'to validate operational execution claims in company guidance.',
        ]
        for g in default_gaps:
            story.append(Paragraph(f'- {g}', S['bullet']))

    story.append(divider())

    # ── Upcoming Catalysts ───────────────────────────────────────────────────
    story.append(Paragraph('UPCOMING CATALYSTS', S['section_header']))

    events = stock.get('events', []) or []
    if events:
        ev_data = [['Date', 'Event']]
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
        # Derive from last_flip and narrative_history for context
        story.append(Paragraph(
            'Catalyst calendar pending. Key items to monitor:',
            S['body_left']
        ))
        last_flip = stock.get('last_flip')
        if last_flip:
            story.append(Paragraph(
                f'- Last narrative event: {last_flip.get("date", "N/A")} '
                f'({last_flip.get("trigger", "")})',
                S['bullet']
            ))
        story.append(Paragraph(
            f'- Next results date: Pending (monitor ASX announcements)',
            S['bullet']
        ))
        story.append(Paragraph(
            f'- Monitor hypothesis tripwires for narrative change signals.',
            S['bullet']
        ))

    story.append(PageBreak())
    return story


# ══════════════════════════════════════════════════════════════════════════════
# PAGE 6: Disclaimer
# ══════════════════════════════════════════════════════════════════════════════
def build_disclaimer(stock, report_date):
    story = []
    ticker_ax = stock.get('ticker', 'UNKNOWN')

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

    return story  # No PageBreak — this is the final page


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
    # Count /Type /Page entries (not /Pages)
    import re
    pages = re.findall(rb'/Type\s*/Page[^s]', content)
    return len(pages)


# ── CLI entry point ───────────────────────────────────────────────────────────
if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Usage: python scripts/generate-investor-briefing.py TICKER')
        print('Example: python scripts/generate-investor-briefing.py WOW')
        sys.exit(1)

    ticker_input = sys.argv[1].upper().replace('.AX', '')
    base = Path(__file__).parent.parent

    out = generate(ticker_input, base)

    pages = count_pages(out)
    print(f'Page count: {pages}')
    if pages != 6:
        print(f'WARNING: Expected 6 pages, got {pages}. '
              f'Review content length and adjust.')
    else:
        print('PASS: Exactly 6 pages.')
