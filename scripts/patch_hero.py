#!/usr/bin/env python3
"""
patch_hero.py
Applies three fixes to index.html:
1. Adds spec section CSS (PIR bar with driver badges above + prices below)
2. Restores full renderReportHero with hero spec sections 1.2-1.5
3. Redesigns valuation range bar to match PIR thin-line style
"""
import sys
import re

INFILE = r'C:\Users\User\continuum-intelligence-v3\index.html'

with open(INFILE, 'r', encoding='utf-8') as f:
    content = f.read()

# ─────────────────────────────────────────────────────────────────────
# PATCH 1: Insert spec section CSS before .report-back
# ─────────────────────────────────────────────────────────────────────
SPEC_CSS = r"""    /* --- Report Page: Spec Sections (1.2-1.5) --- */
    .rh-spec-block {
      padding: var(--space-md) 0;
      border-top: 1px solid var(--border);
    }
    .rh-spec-label {
      font-size: 0.55rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--text-muted);
      margin-bottom: var(--space-xs);
      display: inline;
    }
    .rh-spec-text {
      font-size: 0.88rem;
      line-height: 1.6;
      color: var(--text-secondary);
      margin-top: var(--space-xs);
    }
    .rh-embedded-thesis .rh-spec-text {
      font-family: var(--font-serif);
      color: var(--text-primary);
    }
    .rh-position-range { padding-bottom: var(--space-lg); }

    /* PIR bar: driver badge above bar, prices below bar */
    .pir-bar-wrap {
      position: relative;
      margin-top: var(--space-md);
      height: 96px;
      max-width: 520px;
    }
    .pir-bar {
      position: absolute;
      height: 2px;
      background: var(--border);
      left: 0;
      right: 0;
      top: 42px;
    }
    .pir-world {
      position: absolute;
      transform: translateX(-50%);
      text-align: center;
      bottom: 4px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .pir-driver-badge {
      font-family: var(--font-data);
      font-size: 0.58rem;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 3px;
      background: rgba(61, 170, 109, 0.14);
      color: var(--signal-green);
      white-space: nowrap;
      letter-spacing: 0.05em;
      margin-bottom: 3px;
    }
    .pir-world-tick {
      width: 1px;
      height: 14px;
      background: var(--border);
    }
    .pir-world-below {
      position: absolute;
      transform: translateX(-50%);
      text-align: center;
      top: 50px;
    }
    .pir-world-price {
      font-family: var(--font-data);
      font-size: 0.72rem;
      font-weight: 600;
      color: var(--text-secondary);
      white-space: nowrap;
    }
    .pir-world-label {
      font-size: 0.58rem;
      color: var(--text-muted);
      white-space: nowrap;
      margin-top: 2px;
      max-width: 90px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .pir-current {
      position: absolute;
      transform: translateX(-50%);
      bottom: 4px;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .pir-current-dot {
      font-size: 0.85rem;
      color: var(--accent-teal);
      line-height: 1;
    }
    .pir-current-label {
      font-family: var(--font-data);
      font-size: 0.7rem;
      font-weight: 700;
      color: var(--accent-teal);
      white-space: nowrap;
      margin-bottom: 3px;
    }
    .pir-note {
      font-size: 0.6rem;
      color: var(--text-muted);
      font-style: italic;
      margin-top: var(--space-sm);
    }

    /* VR zone badge colours on PIR-style tick bar */
    .vr-badge-bear { background: rgba(212, 85, 85, 0.12); color: var(--signal-red) !important; }
    .vr-badge-fair { background: rgba(212, 160, 60, 0.12); color: var(--signal-amber) !important; }
    .vr-badge-bull { background: rgba(61, 170, 109, 0.12); color: var(--signal-green) !important; }

    .rh-skew-indicator { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; }
    .rh-skew-indicator .rh-spec-text { flex-basis: 100%; margin-top: 4px; }
    .rh-skew-value {
      font-family: var(--font-data);
      font-size: 0.8rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      padding: 2px 8px;
      border-radius: 3px;
    }
    .rh-skew-down { color: var(--signal-red); background: rgba(239,68,68,0.08); }
    .rh-skew-up   { color: var(--signal-green); background: rgba(34,184,167,0.08); }
    .rh-skew-balanced { color: var(--signal-amber); background: rgba(245,158,11,0.08); }
    .ndp-event {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--text-primary);
      margin-top: var(--space-xs);
      margin-bottom: 2px;
    }
    .ndp-date { color: var(--text-muted); font-weight: 400; }

"""

OLD_REPORT_BACK = '    .report-back {\n      font-size: 0.7rem;'
if OLD_REPORT_BACK in content:
    content = content.replace(OLD_REPORT_BACK, SPEC_CSS + '    .report-back {\n      font-size: 0.7rem;', 1)
    print('PATCH 1 applied: spec CSS inserted')
else:
    print('PATCH 1 FAILED: .report-back anchor not found', file=sys.stderr)
    sys.exit(1)

# ─────────────────────────────────────────────────────────────────────
# PATCH 2: Replace simple renderReportHero with full version
# ─────────────────────────────────────────────────────────────────────
OLD_HERO_RETURN = (
    "        return '<div class=\"report-hero\">' +\n"
    "          '<div class=\"report-hero-inner\">' +\n"
    "          '<div class=\"rh-stock-nav\">' + prevLink + nextLink + '</div>' +\n"
    "          '<a class=\"report-back\" href=\"#home\" onclick=\"navigate(\\'home\\')\">\\u2190 Back to Coverage</a>' +\n"
    "          '<div class=\"rh-main\">' +\n"
    "          '<div class=\"rh-left\">' +\n"
    "          '<div class=\"rh-type\">Narrative Intelligence \\u2014 Initial Coverage</div>' +\n"
    "          '<div class=\"rh-ticker\">' + data.company + '</div>' +\n"
    "          '<div class=\"rh-company\">' + data.tickerFull + ' \\u2022 ' + data.exchange + ' \\u2022 ' + data.sector + '</div>' +\n"
    "          '<div class=\"rh-sector-tag\">' + data.heroDescription + '</div>' +\n"
    "          (data.heroCompanyDescription ? '<div class=\"rh-company-desc\">' + data.heroCompanyDescription + '</div>' : '') +\n"
    "          '</div>' +\n"
    "          '<div class=\"rh-right\">' +\n"
    "          sparklineHtml +\n"
    "          '<div class=\"rh-price\"><span class=\"rh-price-currency\">' + data.currency + '</span>' + data.price + '</div>' +\n"
    "          '<div class=\"rh-metrics\">' + metricsHtml + '</div>' +\n"
    "          '</div>' +\n"
    "          '</div>' +\n"
    "          '</div>' +\n"
    "          '</div>';\n"
    "      }"
)

NEW_HERO_RETURN = (
    "        // -- Spec Section 1.2 -- What the Price Embeds\n"
    "        var embeddedThesisHtml = '';\n"
    "        if (data.hero && data.hero.embedded_thesis) {\n"
    "          embeddedThesisHtml =\n"
    "            '<div class=\"rh-spec-block rh-embedded-thesis\">' +\n"
    "              '<div class=\"rh-spec-label\">WHAT THE PRICE EMBEDS</div>' +\n"
    "              '<p class=\"rh-spec-text\">' + data.hero.embedded_thesis + '</p>' +\n"
    "            '</div>';\n"
    "        }\n"
    "\n"
    "        // -- Spec Section 1.3 -- Position in Range\n"
    "        // Driver badges ABOVE bar, prices below bar, 2 decimal places\n"
    "        var positionInRangeHtml = '';\n"
    "        if (data.hero && data.hero.position_in_range) {\n"
    "          var pir = data.hero.position_in_range;\n"
    "          var pirWorlds = pir.worlds;\n"
    "          var pirCurrent = pir.current_price;\n"
    "          var pirPrices = pirWorlds.map(function(w) { return w.price; });\n"
    "          pirPrices.push(pirCurrent);\n"
    "          var pirMin = Math.min.apply(null, pirPrices);\n"
    "          var pirMax = Math.max.apply(null, pirPrices);\n"
    "          var pirRange = pirMax - pirMin || 1;\n"
    "          var worldAboveHtml = '';\n"
    "          var worldBelowHtml = '';\n"
    "          for (var wi = 0; wi < pirWorlds.length; wi++) {\n"
    "            var ww = pirWorlds[wi];\n"
    "            var wpct = ((ww.price - pirMin) / pirRange * 100).toFixed(1);\n"
    "            worldAboveHtml +=\n"
    "              '<div class=\"pir-world\" style=\"left:' + wpct + '%\">' +\n"
    "                (ww.driver ? '<div class=\"pir-driver-badge\">' + ww.driver + '</div>' : '') +\n"
    "                '<div class=\"pir-world-tick\"></div>' +\n"
    "              '</div>';\n"
    "            worldBelowHtml +=\n"
    "              '<div class=\"pir-world-below\" style=\"left:' + wpct + '%\">' +\n"
    "                '<div class=\"pir-world-price\">A$' + ww.price.toFixed(2) + '</div>' +\n"
    "                '<div class=\"pir-world-label\">' + ww.label + '</div>' +\n"
    "              '</div>';\n"
    "          }\n"
    "          var currentPct = ((pirCurrent - pirMin) / pirRange * 100).toFixed(1);\n"
    "          positionInRangeHtml =\n"
    "            '<div class=\"rh-spec-block rh-position-range\">' +\n"
    "              '<div class=\"rh-spec-label\">POSITION IN RANGE</div>' +\n"
    "              '<div class=\"pir-bar-wrap\">' +\n"
    "                '<div class=\"pir-bar\">' +\n"
    "                  worldAboveHtml +\n"
    "                  '<div class=\"pir-current\" style=\"left:' + currentPct + '%\">' +\n"
    "                    '<div class=\"pir-current-label\">A$' + pirCurrent.toFixed(2) + '</div>' +\n"
    "                    '<div class=\"pir-current-dot\">&#9679;</div>' +\n"
    "                  '</div>' +\n"
    "                '</div>' +\n"
    "                worldBelowHtml +\n"
    "              '</div>' +\n"
    "              (pir.note ? '<div class=\"pir-note\">' + pir.note + '</div>' : '') +\n"
    "            '</div>';\n"
    "        }\n"
    "\n"
    "        // -- Spec Section 1.4 -- Skew Indicator\n"
    "        var skewIndicatorHtml = '';\n"
    "        if (data.hero && data.hero.skew) {\n"
    "          var skewCls = data.hero.skew === 'DOWNSIDE' ? 'rh-skew-down' : data.hero.skew === 'UPSIDE' ? 'rh-skew-up' : 'rh-skew-balanced';\n"
    "          skewIndicatorHtml =\n"
    "            '<div class=\"rh-spec-block rh-skew-indicator\">' +\n"
    "              '<span class=\"rh-spec-label\">SKEW: </span>' +\n"
    "              '<span class=\"rh-skew-value ' + skewCls + '\">' + data.hero.skew + '</span>' +\n"
    "              (data.hero.skew_description ? '<p class=\"rh-spec-text\">' + data.hero.skew_description + '</p>' : '') +\n"
    "            '</div>';\n"
    "        }\n"
    "\n"
    "        // -- Spec Section 1.5 -- Next Decision Point\n"
    "        var nextDecisionHtml = '';\n"
    "        if (data.hero && data.hero.next_decision_point) {\n"
    "          var ndp = data.hero.next_decision_point;\n"
    "          nextDecisionHtml =\n"
    "            '<div class=\"rh-spec-block rh-next-decision\">' +\n"
    "              '<div class=\"rh-spec-label\">NEXT DECISION POINT</div>' +\n"
    "              '<div class=\"ndp-event\">' + ndp.event + ' &middot; <span class=\"ndp-date\">' + ndp.date + '</span></div>' +\n"
    "              '<p class=\"rh-spec-text\">' + ndp.metric + '. ' + ndp.thresholds + '</p>' +\n"
    "            '</div>';\n"
    "        }\n"
    "\n"
    "        return '<div class=\"report-hero\">' +\n"
    "          '<div class=\"report-hero-inner\">' +\n"
    "          '<div class=\"rh-stock-nav\">' + prevLink + nextLink + '</div>' +\n"
    "          '<a class=\"report-back\" href=\"#home\" onclick=\"navigate(\\'home\\')\">\\u2190 Back to Coverage</a>' +\n"
    "          '<div class=\"rh-main\">' +\n"
    "          '<div class=\"rh-left\">' +\n"
    "          '<div class=\"rh-type\">Narrative Intelligence \\u2014 Initial Coverage</div>' +\n"
    "          '<div class=\"rh-ticker\">' + data.company + '</div>' +\n"
    "          '<div class=\"rh-company\">' + data.tickerFull + ' \\u2022 ' + data.exchange + ' \\u2022 ' + data.sector + '</div>' +\n"
    "          '<div class=\"rh-sector-tag\">' + data.heroDescription + '</div>' +\n"
    "          (data.heroCompanyDescription ? '<div class=\"rh-company-desc\">' + data.heroCompanyDescription + '</div>' : '') +\n"
    "          '</div>' +\n"
    "          '<div class=\"rh-right\">' +\n"
    "          sparklineHtml +\n"
    "          '<div class=\"rh-price\"><span class=\"rh-price-currency\">' + data.currency + '</span>' + data.price + '</div>' +\n"
    "          '<div class=\"rh-metrics\">' + metricsHtml + '</div>' +\n"
    "          '</div>' +\n"
    "          '</div>' +\n"
    "          embeddedThesisHtml +\n"
    "          positionInRangeHtml +\n"
    "          skewIndicatorHtml +\n"
    "          nextDecisionHtml +\n"
    "          '</div>' +\n"
    "          '</div>';\n"
    "      }"
)

if OLD_HERO_RETURN in content:
    content = content.replace(OLD_HERO_RETURN, NEW_HERO_RETURN, 1)
    print('PATCH 2 applied: renderReportHero restored with hero spec sections')
else:
    # Try a shorter anchor
    anchor = "          '</div>' +\n          '</div>';\n      }\n\n      // -- Phase 5.1: Macro Context Bar"
    if "// -- Phase 5.1" in content or "// ── Phase 5.1" in content:
        print('PATCH 2: trying alternate anchor')
        # Find the end of the simple renderReportHero
        simple_end = (
            "          '</div>' +\n"
            "          '</div>';\n"
            "      }\n"
            "\n"
            "      // \u2500\u2500 Phase 5.1: Macro Context Bar"
        )
        if simple_end in content:
            new_end = NEW_HERO_RETURN + "\n\n      // \u2500\u2500 Phase 5.1: Macro Context Bar"
            content = content.replace(simple_end, new_end, 1)
            print('PATCH 2 applied via alternate anchor')
        else:
            print('PATCH 2 FAILED: could not find renderReportHero end', file=sys.stderr)
            sys.exit(1)
    else:
        print('PATCH 2 FAILED: could not find renderReportHero return', file=sys.stderr)
        sys.exit(1)

# ─────────────────────────────────────────────────────────────────────
# PATCH 3: Replace VR segmented bar with PIR tick-style bar
# ─────────────────────────────────────────────────────────────────────
# Replace the segment width calculations + segmented bar HTML
OLD_VR_SEGS = (
    "        // Compute segment widths as % of full range\n"
    "        var totalRange = high - low;\n"
    "        if (totalRange <= 0) return '';\n"
    "        var greenPct = Math.max(0, ((fairLow - low) / totalRange) * 100);\n"
    "        var amberPct = Math.max(0, ((fairHigh - fairLow) / totalRange) * 100);\n"
    "        var redPct = Math.max(0, ((high - fairHigh) / totalRange) * 100);\n"
    "        // Clamp to sum to 100\n"
    "        var total = greenPct + amberPct + redPct;\n"
    "        if (total > 0) { greenPct = greenPct / total * 100; amberPct = amberPct / total * 100; redPct = redPct / total * 100; }\n"
    "\n"
    "        // Current price marker position\n"
    "        var markerPct = Math.max(1, Math.min(99, ((cur - low) / totalRange) * 100));"
)

NEW_VR_SEGS = (
    "        // Price range for tick-style bar\n"
    "        var totalRange = high - low;\n"
    "        if (totalRange <= 0) return '';\n"
    "\n"
    "        // Current price marker position\n"
    "        var markerPct = Math.max(1, Math.min(99, ((cur - low) / totalRange) * 100));\n"
    "\n"
    "        // Build tick anchors: Bear / Fair Low / Fair High / Bull\n"
    "        var vrAnchors = [{ price: low, label: 'Bear', badgeCls: 'vr-badge-bear' }];\n"
    "        if (fairLow != null) vrAnchors.push({ price: fairLow, label: 'Fair Low', badgeCls: 'vr-badge-fair' });\n"
    "        if (fairHigh != null) vrAnchors.push({ price: fairHigh, label: 'Fair High', badgeCls: 'vr-badge-fair' });\n"
    "        vrAnchors.push({ price: high, label: 'Bull', badgeCls: 'vr-badge-bull' });\n"
    "\n"
    "        var vrAboveHtml = '';\n"
    "        var vrBelowHtml = '';\n"
    "        for (var vi = 0; vi < vrAnchors.length; vi++) {\n"
    "          var at = vrAnchors[vi];\n"
    "          var vpct = ((at.price - low) / totalRange * 100).toFixed(1);\n"
    "          vrAboveHtml +=\n"
    "            '<div class=\"pir-world\" style=\"left:' + vpct + '%\">' +\n"
    "              '<div class=\"pir-driver-badge ' + at.badgeCls + '\">' + at.label + '</div>' +\n"
    "              '<div class=\"pir-world-tick\"></div>' +\n"
    "            '</div>';\n"
    "          vrBelowHtml +=\n"
    "            '<div class=\"pir-world-below\" style=\"left:' + vpct + '%\">' +\n"
    "              '<div class=\"pir-world-price\">' + fmt(at.price) + '</div>' +\n"
    "            '</div>';\n"
    "        }"
)

if OLD_VR_SEGS in content:
    content = content.replace(OLD_VR_SEGS, NEW_VR_SEGS, 1)
    print('PATCH 3a applied: VR segment calculations replaced')
else:
    print('PATCH 3a FAILED: could not find VR segment calculations', file=sys.stderr)
    sys.exit(1)

# Replace the segmented bar HTML in the return statement
OLD_VR_BAR_HTML = (
    "          '<div class=\"vr-bar-wrap\">' +\n"
    "          '<div class=\"vr-bar\">' +\n"
    "          '<div class=\"vr-seg-green\"  style=\"width:' + greenPct.toFixed(1) + '%\"></div>' +\n"
    "          '<div class=\"vr-seg-amber\"  style=\"width:' + amberPct.toFixed(1) + '%\"></div>' +\n"
    "          '<div class=\"vr-seg-red\"    style=\"width:' + redPct.toFixed(1) + '%\"></div>' +\n"
    "          '</div>' +\n"
    "          '<div class=\"vr-marker\" style=\"left:' + markerPct.toFixed(1) + '%\">' +\n"
    "          '<div class=\"vr-marker-pin\"></div>' +\n"
    "          '<div class=\"vr-marker-label\">' + fmt(cur) + '</div>' +\n"
    "          '</div>' +\n"
    "          '</div>' +\n"
    "          '<div class=\"vr-endpoints\">' +\n"
    "          '<span class=\"vr-endpoint bear\">Bear ' + fmt(low) + '</span>' +\n"
    "          '<span class=\"vr-endpoint\">Fair ' + fmt(fairLow) + ' \u2013 ' + fmt(fairHigh) + '</span>' +\n"
    "          '<span class=\"vr-endpoint bull\">Bull ' + fmt(high) + '</span>' +\n"
    "          '</div>' +"
)

NEW_VR_BAR_HTML = (
    "          '<div class=\"pir-bar-wrap\">' +\n"
    "          '<div class=\"pir-bar\">' +\n"
    "          vrAboveHtml +\n"
    "          '<div class=\"pir-current\" style=\"left:' + markerPct.toFixed(1) + '%\">' +\n"
    "          '<div class=\"pir-current-label\">' + fmt(cur) + '</div>' +\n"
    "          '<div class=\"pir-current-dot\">&#9679;</div>' +\n"
    "          '</div>' +\n"
    "          '</div>' +\n"
    "          vrBelowHtml +\n"
    "          '</div>' +"
)

if OLD_VR_BAR_HTML in content:
    content = content.replace(OLD_VR_BAR_HTML, NEW_VR_BAR_HTML, 1)
    print('PATCH 3b applied: VR bar HTML replaced with tick-style')
else:
    print('PATCH 3b FAILED: could not find VR bar HTML', file=sys.stderr)
    sys.exit(1)

with open(INFILE, 'w', encoding='utf-8') as f:
    f.write(content)

print('All patches applied successfully.')
