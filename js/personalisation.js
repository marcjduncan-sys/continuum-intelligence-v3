/* ============================================================
   PERSONALISATION DEMONSTRATION PAGE
   Data + Render + State + Interactions
   ============================================================ */
(function() {
'use strict';

// ============================================================
// DATA: MANAGERS
// ============================================================

var PN_MANAGERS = {
    pullen: {
        id: 'pullen', name: 'Alan Pullen', firm: 'Magellan Financial Group',
        fund: 'Magellan Global Fund',
        traits: [
            { label: 'Evidence-first', type: 'cognitive' },
            { label: 'Analytical under loss', type: 'emotional' },
            { label: 'Well-calibrated', type: 'bias' },
            { label: 'Deliberate', type: 'decision' }
        ]
    },
    mcvicar: {
        id: 'mcvicar', name: 'Ben McVicar', firm: 'Magellan Financial Group',
        fund: 'Magellan Infrastructure Fund',
        traits: [
            { label: 'Quantitative-first', type: 'cognitive' },
            { label: 'Defensive under loss', type: 'emotional' },
            { label: 'Narrows focus', type: 'bias' },
            { label: 'Deliberate', type: 'decision' }
        ]
    },
    lamm: {
        id: 'lamm', name: 'Raphael Lamm', firm: 'L1 Capital',
        fund: 'L1 Capital Long Short Fund',
        traits: [
            { label: 'Conclusion-first', type: 'cognitive' },
            { label: 'Offensive under loss', type: 'emotional' },
            { label: 'Overconfident', type: 'bias' },
            { label: 'Fast conviction', type: 'decision' }
        ]
    },
    steinthal: {
        id: 'steinthal', name: 'David Steinthal', firm: 'L1 Capital',
        fund: 'L1 Capital International Fund',
        traits: [
            { label: 'Qualitative-first', type: 'cognitive' },
            { label: 'Moderate loss processing', type: 'emotional' },
            { label: 'Underconfident', type: 'bias' },
            { label: 'Moderate conviction', type: 'decision' }
        ]
    },
    burns: {
        id: 'burns', name: 'Marcus Burns', firm: 'Spheria Asset Management',
        fund: 'Spheria Smaller Companies Fund',
        traits: [
            { label: 'Evidence-first', type: 'cognitive' },
            { label: 'Analytical under loss', type: 'emotional' },
            { label: 'Disposition effect', type: 'bias' },
            { label: 'Deliberate', type: 'decision' }
        ]
    },
    booker: {
        id: 'booker', name: 'Matthew Booker', firm: 'Spheria Asset Management',
        fund: 'Spheria Microcap Fund',
        traits: [
            { label: 'Quantitative-first', type: 'cognitive' },
            { label: 'Defensive under loss', type: 'emotional' },
            { label: 'Model anchoring', type: 'bias' },
            { label: 'Deliberate', type: 'decision' }
        ]
    }
};

// ============================================================
// DATA: SCENARIOS
// ============================================================

var PN_SCENARIOS = {
    hls: {
        id: 'hls', label: 'Thesis Under Pressure', type: 'negative',
        stock: 'Healius (ASX:HLS) | A$680M | Healthcare',
        signal: 'Flat pathology volumes, CFO resignation, unchanged debt. Bull thesis survival: 55% \u2192 35%.',
        rawSignal: 'SIGNAL: Position Update | Earnings Miss + Management Event\nSTOCK: Healius Limited (ASX:HLS) | Market Cap: ~A$680M | Sector: Healthcare, Pathology Services\nDATE: 6 February 2026 | URGENCY: Tier 2 (Position Update, Event-Driven)\n\nSIGNAL SUMMARY\nHealius reported Q3 FY26 pathology volumes flat versus prior corresponding period, missing consensus expectations for 3% organic growth. The Agilex Biolabs clinical trials division has downgraded FY26 revenue guidance by 15%, citing delayed pharmaceutical trial commencements across multiple clients. Net debt remains at A$855M, unchanged from the prior half, despite management\u2019s previous commentary about deleveraging from Lumus Imaging divestiture proceeds. Management has withdrawn its prior guidance that the business would reach \u201cnormalised operations by 2H FY26.\u201d\n\nThe CFO has resigned, citing personal reasons. No replacement has been announced. The resignation is effective in 4 weeks.\n\nKEY DATA POINTS\n\u2022 Pathology volume growth (Q3): 0.0% vs +3.0% consensus (-3.0pp)\n\u2022 Agilex revenue guidance (FY26): Down 15% vs prior guidance\n\u2022 Net debt: A$855M vs A$780M expected (+A$75M)\n\u2022 Altman Z-score: -0.45 (distress territory)\n\u2022 Share price (prior close): A$0.94 (down 67% over 3yr)\n\nTHESIS IMPACT\nBull thesis (turnaround): Weakened. Three pillars were (1) pathology volume recovery, (2) cost restructuring, (3) debt reduction. Pillar 1 stalled. Pillar 3 failed. Pillar 2 now carrying entire thesis.\nBear thesis (value trap): Strengthened. Flat volumes + Altman Z-score -0.45 + CFO departure = pattern consistent with structural impairment.\nACH Survival Score: Bull thesis 55% \u2192 35%.'
    },
    min: {
        id: 'min', label: 'Consensus Challenge', type: 'positive',
        stock: 'Mineral Resources (ASX:MIN) | A$11.5B | Mining',
        signal: 'Lithium price recovery, operational turnaround under new leadership. Bear thesis weakening.',
        rawSignal: 'SIGNAL: New Opportunity | Thesis Reassessment\nSTOCK: Mineral Resources Limited (ASX:MIN) | Market Cap: ~A$11.5B | Sector: Mining Services + Lithium\nDATE: 6 February 2026 | URGENCY: Tier 3 (New Opportunity)\n\nSIGNAL SUMMARY\nMineral Resources has reported a material improvement in operational metrics following Chris Ellison\u2019s departure as Managing Director. The new CEO (interim) has initiated a balance sheet review, suspended the Mt Marion expansion capex (preserving ~A$400M), and signalled a shift from growth-at-all-costs to capital discipline. Spodumene prices have recovered to US$1,250/t from US$900/t trough, driven by Chinese energy storage system (ESS) demand exceeding market expectations.\n\nBroker consensus has shifted from 14 Sell/Hold and 3 Buy to 8 Sell/Hold and 9 Buy over the past 60 days. Short interest has declined from 8.2% to 5.1%.\n\nKEY DATA POINTS\n\u2022 Spodumene price: US$1,250/t (was US$900, +39%)\n\u2022 Broker consensus (Buy): 9/17 (was 3/17, +6 upgrades)\n\u2022 Short interest: 5.1% (was 8.2%, -3.1pp)\n\u2022 Net debt/EBITDA (est): 2.8x (was 3.4x, improving)\n\u2022 Iron ore (mining services): Stable baseline\n\nTHESIS IMPACT\nBull thesis (operational turnaround + lithium recovery): Strengthened. New management discipline + lithium price recovery + broker consensus shift = multiple concurrent positive signals.\nBear thesis (overleveraged, Ellison governance risk): Weakened on governance (Ellison gone), partially addressed on leverage (capex suspension), but net debt/EBITDA still elevated at 2.8x.\nACH Survival Score: Bull thesis 45% \u2192 62%.'
    }
};

// ============================================================
// DATA: DELIVERIES (all 12 manager x scenario combinations)
// ============================================================

var PN_DELIVERIES = {
    hls: {
        pullen: {
            body: "Signal noted \u2014 outside Magellan Global Fund mandate.\n\nHealius (ASX:HLS, A$680M, Healthcare/Pathology) missed Q3 pathology volumes and downgraded Agilex guidance. Domestic Australian small cap \u2014 no action required for global equities mandate. Relevant as a data point on Australian healthcare services demand trends if monitoring global pathology/diagnostics peers.",
            annotations: [
                { step: 1, type: 'mandate', badge: 'Mandate Filter', detail: 'OUT OF MANDATE. HLS is domestic small cap (A$680M). Magellan Global invests global large/mega cap.' },
                { step: 5, type: 'format', badge: 'Format & Timing', detail: 'Brief. One paragraph. Delivered in morning digest.' }
            ]
        },
        mcvicar: {
            body: "Signal noted \u2014 outside Magellan Infrastructure Fund mandate.\n\nHealius (ASX:HLS, A$680M, Healthcare/Pathology) reported flat pathology volumes and a CFO resignation. Not an infrastructure asset \u2014 no action required. No read-through to current infrastructure holdings identified.",
            annotations: [
                { step: 1, type: 'mandate', badge: 'Mandate Filter', detail: 'OUT OF MANDATE. HLS is healthcare services. Magellan Infrastructure invests in global infrastructure.' },
                { step: 5, type: 'format', badge: 'Format & Timing', detail: 'Brief. One line. Weekly summary.' }
            ]
        },
        lamm: {
            body: "HLS: Short Opportunity Catalyst \u2014 CFO Out, Volumes Flat, Debt Stuck\n\nHealius has delivered a triple negative: pathology volumes flat (missed +3% consensus), Agilex Biolabs guiding down 15%, and CFO resigning. Net debt at A$855M is unchanged despite the Lumus divestiture \u2014 the deleveraging thesis is dead. Altman Z-score sits at -0.45.\n\nActionable angle: If you\u2019re not already short, this is your catalyst. The market hasn\u2019t fully priced the CFO departure yet \u2014 announcement was after-hours. Borrow should be available given the A$680M market cap.\n\nKey risk to the short: Pathology is Medicare-funded essential infrastructure. Volume recovery could still come \u2014 one flat quarter is not structural proof. If you initiate, define your cover trigger: what volume growth number in Q4 would make you cover?\n\nPosition sizing note: L1 Long Short Fund capacity \u2014 adding a short in HLS at this size would move net exposure by approximately [X]bp.",
            annotations: [
                { step: 1, type: 'mandate', badge: 'Mandate Filter', detail: 'IN MANDATE. L1 Long Short invests in Australian equities, all-cap, long and short. HLS is a valid short candidate.' },
                { step: 2, type: 'structural', badge: 'Structural Calibration', detail: 'Conclusion-first. Lamm is conclusion-first, narrative-driven, low information satiation. Lead with the verdict and action angle. Key data points embedded in narrative, not tables. Brief format.' },
                { step: 3, type: 'emotional', badge: 'Emotional Calibration', detail: 'Offensive framing. Lamm processes loss/negative signals offensively \u2014 "this is your catalyst" frames the negative signal as opportunity. No hedging, no graduated context. Direct.' },
                { step: 4, type: 'bias', badge: 'Bias Counter-Intervention', detail: 'Overconfidence counter. "Define your cover trigger" forces pre-commitment to disconfirmation criteria before entry. Lamm\u2019s overconfidence manifests on high-conviction contrarian positions; this is exactly that scenario. Socratic framing (question, not directive) because CRT 3/4 = high enough to rationalise directive warnings.' },
                { step: 5, type: 'format', badge: 'Format & Timing', detail: 'Real-time delivery. No batching. Narrative format.' }
            ]
        },
        steinthal: {
            body: "Signal noted \u2014 outside L1 International Fund mandate. Coordination note below.\n\nHealius (ASX:HLS, A$680M, Healthcare/Pathology): domestic small cap, negative signal (flat volumes, CFO departure, debt unchanged). No action for international mandate.\n\nCoordination: Raphael Lamm may act on this signal for the L1 Long Short Fund \u2014 it aligns with his short thesis criteria. If L1 Long Short initiates a HLS short, you should be aware in case of any cross-fund risk considerations.",
            annotations: [
                { step: 1, type: 'mandate', badge: 'Mandate Filter', detail: 'OUT OF MANDATE. L1 International invests global, ex-Australia. HLS is domestic. Cross-strategy coordination note added.' },
                { step: 2, type: 'structural', badge: 'Structural Calibration', detail: 'Cross-strategy coordination note flagged as Layer 1 firm-level delivery.' },
                { step: 5, type: 'format', badge: 'Format & Timing', detail: 'Morning delivery. Brief. Coordination note appended.' }
            ]
        },
        burns: {
            body: "HLS: Thesis Review \u2014 Three Pillars, Two Under Pressure\n\nHealius update by thesis pillar:\n\nPillar 1 \u2014 Pathology Volume Recovery: STALLED. Q3 volumes flat vs +3% consensus. Medicare-funded volumes should recover with demographics, but timing is uncertain. One flat quarter is not structural failure, but it is not the inflection the turnaround thesis requires.\n\nPillar 2 \u2014 Cost Restructuring: UNASSESSED. No new data in this update. This pillar is now carrying the entire thesis \u2014 if cost restructuring doesn\u2019t deliver margin improvement in 2H FY26, the turnaround thesis fails regardless of volume trajectory.\n\nPillar 3 \u2014 Debt Reduction: FAILING. Net debt at A$855M, unchanged despite Lumus proceeds. Management has withdrawn \u201cnormalised operations by 2H FY26\u201d guidance. Altman Z-score at -0.45 (distress territory).\n\nAdditional signal: CFO resignation. Personal reasons stated. No replacement announced. Effective in 4 weeks. In context of the debt position, this is concerning.\n\nSpheria holds 6.55% of HLS. This is a substantial holding with disclosure obligations.\n\nDecision framework: If you did not already hold HLS at 6.55%, would you initiate this position today at A$0.94?\n\nInaction carries risk: Spheria\u2019s substantial holding is public. If the thesis is failing, continued holding is a visible signal to the market about your conviction. If your conviction has genuinely declined, inaction is not neutral \u2014 it is a decision to maintain a position you may not initiate from scratch.\n\nCounter-thesis to consider: Pathology is essential infrastructure. Demographics are structural tailwinds. A$0.94 may represent deep value if cost restructuring delivers. But deep value and value trap are distinguished by the balance sheet, and this balance sheet is not improving.",
            annotations: [
                { step: 1, type: 'mandate', badge: 'Mandate Filter', detail: 'IN MANDATE. HLS (A$680M) is outside ASX 100, in the Small Ordinaries. Spheria Smaller Companies holds 6.55% (top holding). Substantial holding flag activated.' },
                { step: 2, type: 'structural', badge: 'Structural Calibration', detail: 'Evidence-first, balanced. Burns is evidence-first, builds thesis from data. Structured by thesis pillar (his framework for evaluating positions). Moderate depth with drill-down available.' },
                { step: 3, type: 'emotional', badge: 'Emotional Calibration', detail: 'Analytical. Burns processes loss analytically. Direct evidence presented without graduated softening. The substantial holding is acknowledged as a contextual factor, not a pressure point. "Inaction carries risk" is analytical framing, not emotional.' },
                { step: 4, type: 'bias', badge: 'Bias Counter-Intervention', detail: 'Disposition effect + Value trap. "If you did not already hold HLS at 6.55%, would you initiate this position today at A$0.94?" is the classic disposition-effect counter \u2014 forces clean-sheet evaluation. "Inaction is not neutral" addresses the specific condition where Burns\u2019 disposition effect manifests (on publicly disclosed positions where exit is itself a signal).' },
                { step: 5, type: 'format', badge: 'Format & Timing', detail: 'Morning digest. Moderate depth. Balanced narrative with data.' }
            ]
        },
        booker: {
            body: "HLS: Model Update Required \u2014 Assumptions Need Downward Revision\n\nKey metrics vs your base case:\n\n\u2022 Pathology volume growth: 0.0% vs +3.0% consensus = Revenue line needs cut\n\u2022 Agilex revenue (FY26): Down 15% vs prior guidance = Growth engine decelerating\n\u2022 Net debt: A$855M vs A$780M (deleveraging) = No deleveraging occurring\n\u2022 Altman Z-score: -0.45 = Distress indicator\n\nBase case assumptions require downward revision. The pathology volume growth assumption and the debt reduction assumption are both invalidated by this update. If your intrinsic value calculation still assumes volume recovery in 2H FY26 and deleveraging to A$780M, your model output is stale.\n\nCFO resignation: Effective in 4 weeks. No replacement. In context of A$855M net debt and Altman Z-score of -0.45, financial leadership continuity is a material risk.\n\nLiquidity context: HLS average daily volume ~A$2.5M. Exit takes 2-4 trading days. Liquidity is not a binding constraint. If your analytical conclusion is to reduce, the market structure supports execution.\n\nBroader context you may be missing: The CFO departure, combined with withdrawn guidance and flat volumes, may indicate internal awareness of structural issues not yet disclosed. Management\u2019s withdrawal of \u201cnormalised operations by 2H FY26\u201d guidance is a significant downgrade from prior commentary. Evaluate whether the turnaround thesis has any remaining pillar with evidentiary support.\n\nIf HLS has graduated above the microcap range during your holding period, review whether this position still fits within the Microcap Fund mandate or whether it should be allocated to the Smaller Companies Fund.",
            annotations: [
                { step: 1, type: 'mandate', badge: 'Mandate Filter', detail: 'MARGINAL. HLS at A$680M is at the upper boundary of microcap. If Spheria Microcap held it when smaller, it may still hold a residual position. Treated as in-mandate with graduation flag.' },
                { step: 2, type: 'structural', badge: 'Structural Calibration', detail: 'Quantitative-first, evidence-first. Booker is quantitative \u2014 leads with a model comparison table. Data first, narrative wraps the numbers. Full context. Every data point mapped to model implication.' },
                { step: 3, type: 'emotional', badge: 'Emotional Calibration', detail: 'Defensive, data-led. Booker processes loss defensively. "Broader context you may be missing" gently widens his focus beyond the immediate data without confrontation. Table format reduces emotional load (numbers feel more objective than narrative).' },
                { step: 4, type: 'bias', badge: 'Bias Counter-Intervention', detail: 'Anchoring (model) + Illiquidity bias. "Base case assumptions require downward revision" directly targets model anchoring \u2014 forces assumption update rather than clinging to stale intrinsic value. "Liquidity is not a binding constraint" directly counters illiquidity bias \u2014 Booker\u2019s pattern is to avoid selling because "I can\u2019t sell without moving the price" becomes "I won\u2019t sell." The explicit liquidity data removes the rationalisation.' },
                { step: 5, type: 'format', badge: 'Format & Timing', detail: 'Morning digest. Full depth. Quantitative format with tables.' }
            ]
        }
    },
    min: {
        pullen: {
            body: "Signal noted \u2014 outside Magellan Global Fund mandate.\n\nMineral Resources (ASX:MIN, A$11.5B, Mining Services/Lithium) showing operational improvement post-Ellison departure, spodumene recovery to US$1,250/t. Domestic-listed mining conglomerate \u2014 no action required for global equities mandate. Note as a data point on global lithium supply/demand dynamics if monitoring battery materials peers (Albemarle, SQM, Pilbara Minerals).",
            annotations: [
                { step: 1, type: 'mandate', badge: 'Mandate Filter', detail: 'OUT OF MANDATE. MIN is ASX-listed domestic mining. Magellan Global invests global large/mega cap.' },
                { step: 5, type: 'format', badge: 'Format & Timing', detail: 'Brief. One paragraph. Morning digest.' }
            ]
        },
        mcvicar: {
            body: "Signal noted \u2014 outside Magellan Infrastructure Fund mandate.\n\nMineral Resources (ASX:MIN, A$11.5B, Mining Services/Lithium) reports operational improvements. Not an infrastructure asset. Marginal read-through: if you hold port infrastructure or rail assets with mining services exposure, note the improving volume outlook for bulk commodities transport.",
            annotations: [
                { step: 1, type: 'mandate', badge: 'Mandate Filter', detail: 'OUT OF MANDATE. MIN is mining/lithium. Not infrastructure. Marginal sector read-through noted for transport infrastructure holdings.' },
                { step: 5, type: 'format', badge: 'Format & Timing', detail: 'Brief. One paragraph. Weekly summary.' }
            ]
        },
        lamm: {
            body: "MIN: Consensus Is Wrong \u2014 The Bears Are Getting Squeezed\n\nThe market is flipping on Mineral Resources. 6 broker upgrades in 60 days. Short interest down from 8.2% to 5.1%. Spodumene at US$1,250 from US$900 trough. New management has suspended A$400M in capex \u2014 this is a different company from the Ellison era.\n\nYour variant perception: The consensus shift is real but incomplete. The market is pricing operational improvement but still discounting the lithium recovery as cyclical. If Chinese ESS demand sustains (and the data says it is), spodumene above US$1,000 is structural, not cyclical. The bears are right about one thing: Ellison\u2019s governance was a genuine risk. But that risk is now removed.\n\nBefore you act: What could be wrong? (1) Lithium price recovery is a dead cat bounce \u2014 Chinese ESS demand could plateau. (2) Net debt/EBITDA at 2.8x is still elevated \u2014 a lithium price reversal here would stress the balance sheet. (3) New management hasn\u2019t been tested through a full cycle.\n\nL1 note: If Lamm is considering a long position in MIN for the domestic book, Steinthal should be aware for international coordination \u2014 MIN has global commodity exposure.",
            annotations: [
                { step: 1, type: 'mandate', badge: 'Mandate Filter', detail: 'IN MANDATE. L1 Long Short invests Australian all-cap. MIN is A$11.5B ASX-listed.' },
                { step: 2, type: 'structural', badge: 'Structural Calibration', detail: 'Conclusion-first. "Consensus is wrong" leads \u2014 this is Lamm\u2019s language. Contrarian framing. Narrative-driven.' },
                { step: 3, type: 'emotional', badge: 'Emotional Calibration', detail: 'Energising. Lamm is offensive \u2014 positive signals get "the crowd is wrong and you see it" framing. No excessive caution.' },
                { step: 4, type: 'bias', badge: 'Bias Counter-Intervention', detail: 'Overconfidence + Contrarian overcorrection. "Before you act" section forces pause. "What could be wrong?" is Socratic. "The bears are right about one thing" validates the opposing view to prevent reflexive contrarianism. Cross-strategy coordination note flagged.' },
                { step: 5, type: 'format', badge: 'Format & Timing', detail: 'Real-time. Narrative.' }
            ]
        },
        steinthal: {
            body: "MIN: Quality Assessment \u2014 Operational Turnaround, Governance Reset, Lithium Recovery\n\nMineral Resources presents an unusual case for the quality screen: a business with historically poor governance (Ellison-era conflicts, related-party transactions) undergoing a genuine reset. The question is whether the operational improvements are structural or cosmetic.\n\nEvidence supporting quality improvement:\n\u2022 New management has suspended A$400M capex (capital discipline signal)\n\u2022 Spodumene recovery to US$1,250/t (demand-driven, not speculative)\n\u2022 Short interest declining from 8.2% to 5.1% (informed sellers retreating)\n\u2022 Mining services division provides stable cash flow base\n\nEvidence against quality status:\n\u2022 Net debt/EBITDA at 2.8x remains elevated for a cyclical business\n\u2022 New management is untested through a cycle\n\u2022 Lithium pricing is inherently volatile; US$1,250 may not sustain\n\u2022 Historical governance failures may have created structural issues not yet visible\n\nQuality verdict: Improving but not yet confirmed. The governance risk removal is genuine. The operational discipline is early-stage. The commodity price recovery creates a tailwind that may mask underlying issues. Monitor for 2 quarters before assigning quality status.\n\nFor your international portfolio: MIN\u2019s lithium exposure gives it global commodity relevance. If you\u2019re constructing a critical minerals thesis, MIN is a domestic proxy for global lithium supply. Weight accordingly \u2014 this is not a traditional quality-growth holding.",
            annotations: [
                { step: 1, type: 'mandate', badge: 'Mandate Filter', detail: 'PARTIAL. MIN is ASX-listed (domestic) but has global commodity exposure. L1 International\u2019s quality-focused mandate can accommodate global thematic positions. In-mandate as thematic context.' },
                { step: 2, type: 'structural', badge: 'Structural Calibration', detail: 'Evidence-first, qualitative. Steinthal is qualitative-first, evidence-first. Quality assessment leads. Evidence organised as for/against (not conclusion-first). Moderate depth.' },
                { step: 3, type: 'emotional', badge: 'Emotional Calibration', detail: 'Moderate. Steinthal is more cautious than Lamm but not defensive. Direct assessment with appropriate caveats. "Improving but not yet confirmed" reflects his quality-over-speed orientation.' },
                { step: 4, type: 'bias', badge: 'Bias Counter-Intervention', detail: 'Confirmation bias counter. Quality screen separates governance improvement (genuine positive) from commodity price recovery (potential false signal). Prevents confirming quality status based on price action alone.' },
                { step: 5, type: 'format', badge: 'Format & Timing', detail: 'Morning delivery. Moderate depth. Balanced narrative.' }
            ]
        },
        burns: {
            body: "Signal noted \u2014 outside Spheria Smaller Companies Fund mandate. Sector context below.\n\nMineral Resources (ASX:MIN, A$11.5B) is far too large for the Smaller Companies mandate (inside ASX 100). However, the lithium price recovery to US$1,250/t has read-through for smaller lithium producers in your universe.\n\nSector read-through for existing holdings:\n\u2022 Spodumene at US$1,250 vs ~US$900 trough = 39% recovery\n\u2022 Demand driver is Chinese ESS (energy storage systems), not EV \u2014 potentially more durable\n\u2022 If you hold small-cap lithium producers, update commodity price assumptions\n\nNo direct action on MIN.",
            annotations: [
                { step: 1, type: 'mandate', badge: 'Mandate Filter', detail: 'OUT OF MANDATE. MIN at A$11.5B is inside ASX 100. Spheria Smaller Companies invests outside ASX 100. Sector read-through provided for in-mandate lithium holdings.' },
                { step: 2, type: 'structural', badge: 'Structural Calibration', detail: 'Evidence-first, brief. Structured bullet list for sector read-through. Burns\u2019 analytical process applied even to out-of-mandate context.' },
                { step: 4, type: 'bias', badge: 'Bias Counter-Intervention', detail: 'Light-touch anchoring counter \u2014 "update commodity price assumptions" nudges model refresh on in-mandate holdings that may be using stale lithium price assumptions.' }
            ]
        },
        booker: {
            body: "Signal noted \u2014 outside Spheria Microcap Fund mandate. Sector context below.\n\nMineral Resources (ASX:MIN, A$11.5B) is far too large for the Microcap mandate. Sector read-through for microcap lithium and mining services holdings:\n\n\u2022 Spodumene price: US$1,250/t \u2192 Revenue assumptions for lithium producers\n\u2022 Demand driver: Chinese ESS \u2192 Review critical minerals holdings\n\u2022 Mining services outlook: Stable \u2192 Positive for microcap mining services cos\n\nModel note: If you hold any microcap lithium producers, update your commodity price assumptions to reflect US$1,250 spot. Your base case may be stale if it still assumes sub-US$1,000 spodumene.\n\nNo direct action on MIN. Sector context only.",
            annotations: [
                { step: 1, type: 'mandate', badge: 'Mandate Filter', detail: 'OUT OF MANDATE. MIN at A$11.5B is far too large. Context delivery only.' },
                { step: 2, type: 'structural', badge: 'Structural Calibration', detail: 'Quantitative \u2014 structured table even for context signal. Model note speaks to Booker\u2019s quantitative process.' },
                { step: 4, type: 'bias', badge: 'Bias Counter-Intervention', detail: 'Light-touch anchoring (model) counter \u2014 "your base case may be stale" nudges assumption updates on in-mandate holdings.' }
            ]
        }
    }
};

// ============================================================
// STATE
// ============================================================

var pnState = {
    selectedManager: null,
    selectedScenario: 'hls',
    compareMode: false,
    compareManager: null
};

// ============================================================
// RENDER: MAIN PAGE
// ============================================================

window.renderPersonalisationPage = function() {
    return '<div class="page-inner">' +
        renderHero() +
        renderLayers() +
        renderDemo() +
        renderAssessment() +
        renderLearning() +
    '</div>' +
    '<footer class="site-footer">' +
        '<div class="footer-inner">' +
            '<div class="footer-bottom">' +
                '<div class="footer-disclaimer">This page demonstrates the Personalisation Agent concept using illustrative scenarios. No real investment analysis is provided. Manager profiles are hypothetical.</div>' +
                '<div class="footer-meta">&copy; 2026 Continuum Intelligence</div>' +
            '</div>' +
        '</div>' +
    '</footer>';
};

// ============================================================
// RENDER: HERO
// ============================================================

function renderHero() {
    return '<div class="pn-hero">' +
        '<div class="pn-hero-inner">' +
            '<h1 class="pn-hero-title">Same facts. Different delivery.<br>Better decisions.</h1>' +
            '<p class="pn-hero-subtitle">The Personalisation Agent calibrates how investment analysis reaches each fund manager \u2014 matching delivery to how they actually think, feel, and decide. The substance never changes. The framing does.</p>' +
            '<div class="pn-split-panel">' +
                '<div class="pn-profile-card profile-a">' +
                    '<div class="pn-profile-label">Profile A</div>' +
                    '<div class="pn-profile-name">Analytical + Low Loss Aversion</div>' +
                    '<div class="pn-profile-traits">' +
                        '<span class="pn-trait pn-trait-cognitive">Clinical</span>' +
                        '<span class="pn-trait pn-trait-cognitive">Data-First</span>' +
                        '<span class="pn-trait pn-trait-emotional">Evidence-Based</span>' +
                    '</div>' +
                    '<div class="pn-profile-text">6/8 evidence domains contradict thesis. Competing hypothesis now has stronger evidentiary support. ACH survival score declined from 55% to 35%. Cost restructuring is the sole remaining pillar.</div>' +
                '</div>' +
                '<div class="pn-profile-card profile-b">' +
                    '<div class="pn-profile-label">Profile B</div>' +
                    '<div class="pn-profile-name">Intuitive + High Loss Aversion</div>' +
                    '<div class="pn-profile-traits">' +
                        '<span class="pn-trait pn-trait-cognitive">Narrative-Led</span>' +
                        '<span class="pn-trait pn-trait-emotional">Loss-Framed</span>' +
                        '<span class="pn-trait pn-trait-decision">Urgent</span>' +
                    '</div>' +
                    '<div class="pn-profile-text">The story is cracking. Competitors are gaining share faster than expected. What is your exposure if this breaks? Define your exit trigger now.</div>' +
                '</div>' +
            '</div>' +
            '<div class="pn-gold-tagline">Different words. Identical facts. Optimised for decision.</div>' +
            '<button class="pn-cta-btn" id="pn-cta-scroll">See it in action <span>\u2193</span></button>' +
        '</div>' +
    '</div>';
}

// ============================================================
// RENDER: THREE LAYERS
// ============================================================

function renderLayers() {
    var svgBuilding = '<svg class="pn-layer-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-4h6v4M9 9h.01M15 9h.01M9 13h.01M15 13h.01"/></svg>';
    var svgTarget = '<svg class="pn-layer-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>';
    var svgBrain = '<svg class="pn-layer-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2C9 2 7 4 7 6.5c0 .5.1 1 .2 1.5C5.3 8.8 4 10.5 4 12.5 4 14.4 5.2 16 7 16.7V20c0 1.1.9 2 2 2h6c1.1 0 2-.9 2-2v-3.3c1.8-.7 3-2.3 3-4.2 0-2-1.3-3.7-3.2-4.5.1-.5.2-1 .2-1.5C17 4 15 2 12 2z"/><path d="M12 2v20M8 8h8M8 12h8M8 16h8"/></svg>';

    var pipelines = [
        { name: 'Mandate Filter', layer: 'Layer 1+2', tip: 'Checks signal against firm constraints and strategy mandate. Out-of-mandate signals get a one-line flag and stop.' },
        { name: 'Structural Calibration', layer: 'Layer 3, Dim A', tip: 'Restructures output to match cognitive architecture: conclusion-first vs evidence-first, data tables vs narrative, depth level.' },
        { name: 'Emotional Calibration', layer: 'Layer 3, Dim B', tip: 'Adjusts framing based on emotional architecture: offensive vs defensive, urgent vs measured, direct vs graduated.' },
        { name: 'Bias Counter-Intervention', layer: 'Layer 3, Dim C', tip: 'Embeds surgical counter-framing where signal context intersects with observed bias patterns. Evidence-based, not categorical.' },
        { name: 'Format & Timing', layer: 'Layer 3, Dim D', tip: 'Delivers in preferred format (narrative, quantitative, brief) at preferred time (real-time, morning digest, weekly).' }
    ];

    var pipelineHtml = '';
    for (var i = 0; i < pipelines.length; i++) {
        if (i > 0) pipelineHtml += '<span class="pn-pipeline-arrow">\u2192</span>';
        pipelineHtml += '<div class="pn-pipeline-step">' +
            '<div class="pn-pipeline-node">' +
                pipelines[i].name +
                '<span class="pn-pipeline-layer">' + pipelines[i].layer + '</span>' +
                '<div class="pn-tooltip">' + pipelines[i].tip + '</div>' +
            '</div>' +
        '</div>';
    }

    return '<div class="pn-section">' +
        '<div class="pn-section-label">Framework</div>' +
        '<h2 class="pn-section-title">Three Layers of Calibration</h2>' +
        '<div class="pn-layers-grid">' +
            '<div class="pn-layer-card">' +
                svgBuilding +
                '<div class="pn-layer-num">Layer 1</div>' +
                '<div class="pn-layer-title">Institutional Context</div>' +
                '<div class="pn-layer-desc">Governance structure, compliance requirements, operational infrastructure, balance sheet. An IC-formatted deliverable at Magellan is appropriate; the same format at Spheria would be absurd.</div>' +
                '<div class="pn-layer-tag">4 domains assessed</div>' +
            '</div>' +
            '<div class="pn-layer-card">' +
                svgTarget +
                '<div class="pn-layer-num">Layer 2</div>' +
                '<div class="pn-layer-title">Strategy Mandate</div>' +
                '<div class="pn-layer-desc">Benchmark, geography, market cap range, long/short capability, position limits. A signal about a $680M Australian healthcare stock is directly relevant to a smaller companies fund but entirely out-of-mandate for a global fund.</div>' +
                '<div class="pn-layer-tag">Hard gate: in / out / marginal</div>' +
            '</div>' +
            '<div class="pn-layer-card">' +
                svgBrain +
                '<div class="pn-layer-num">Layer 3</div>' +
                '<div class="pn-layer-title">Manager Calibration</div>' +
                '<div class="pn-layer-desc">Cognitive architecture, emotional architecture, bias fingerprint, decision style. Every fund manager profiled across four dimensions that determine how analysis is framed, sequenced, and delivered.</div>' +
                '<div class="pn-layer-tag">4 dimensions \u2022 20+ data points</div>' +
            '</div>' +
        '</div>' +
        '<div class="pn-pipeline">' + pipelineHtml + '</div>' +
    '</div>';
}

// ============================================================
// RENDER: INTERACTIVE DEMO
// ============================================================

function renderDemo() {
    // Manager cards
    var managerIds = ['pullen', 'mcvicar', 'lamm', 'steinthal', 'burns', 'booker'];
    var managerHtml = '';
    for (var i = 0; i < managerIds.length; i++) {
        var m = PN_MANAGERS[managerIds[i]];
        var traitsHtml = '';
        for (var j = 0; j < m.traits.length; j++) {
            traitsHtml += '<span class="pn-trait pn-trait-' + m.traits[j].type + '">' + m.traits[j].label + '</span>';
        }
        managerHtml += '<div class="pn-manager-card" data-manager="' + m.id + '">' +
            '<div class="pn-manager-name">' + m.name + '</div>' +
            '<div class="pn-manager-firm">' + m.firm + '</div>' +
            '<div class="pn-manager-fund">' + m.fund + '</div>' +
            '<div class="pn-manager-traits">' + traitsHtml + '</div>' +
        '</div>';
    }

    // Scenario cards
    var scenarioHtml = '';
    var scenarioIds = ['hls', 'min'];
    for (var s = 0; s < scenarioIds.length; s++) {
        var sc = PN_SCENARIOS[scenarioIds[s]];
        var selectedClass = sc.id === 'hls' ? ' selected' : '';
        scenarioHtml += '<div class="pn-scenario-btn' + selectedClass + '" data-scenario="' + sc.id + '">' +
            '<div class="pn-scenario-label">' + sc.label + '</div>' +
            '<div class="pn-scenario-stock">' + sc.stock + '</div>' +
            '<div class="pn-scenario-signal">' + sc.signal + '</div>' +
            '<span class="pn-scenario-tag ' + sc.type + '">' + (sc.type === 'negative' ? 'Negative signal' : 'Positive signal') + '</span>' +
        '</div>';
    }

    return '<div class="pn-demo-section" id="pn-demo-anchor">' +
        '<div class="pn-demo-inner">' +
            '<div class="pn-section-label">Interactive Demonstration</div>' +
            '<h2 class="pn-section-title">Personalisation in Action</h2>' +
            '<p class="pn-section-subtitle">Select a fund manager. Select a scenario. See how the same analysis becomes a different delivery.</p>' +
            '<div class="pn-manager-grid">' + managerHtml + '</div>' +
            '<div class="pn-scenario-row">' + scenarioHtml + '</div>' +
            '<div class="pn-view-controls">' +
                '<div class="pn-view-toggle" id="pn-view-toggle">' +
                    '<button class="active" data-mode="single">Single View</button>' +
                    '<button data-mode="compare">Compare Two</button>' +
                '</div>' +
            '</div>' +
            '<div class="pn-output-panel" id="pn-output-panel">' +
                '<div class="pn-output-empty">Select a manager above to see their calibrated delivery</div>' +
            '</div>' +
        '</div>' +
    '</div>';
}

// ============================================================
// RENDER: ASSESSMENT
// ============================================================

function renderAssessment() {
    var hexacoTable = '<table class="pn-table">' +
        '<tr><th>Domain</th><th>PM-Relevant Mapping</th></tr>' +
        '<tr><td>Honesty-Humility</td><td>Overconfidence tendency, ego investment, fiduciary orientation</td></tr>' +
        '<tr><td>Emotionality</td><td>Loss processing, stress response, drawdown anxiety</td></tr>' +
        '<tr><td>Extraversion</td><td>Herding vulnerability, speed to conviction, social influence</td></tr>' +
        '<tr><td>Agreeableness</td><td>Social calibration style (direct vs indirect feedback)</td></tr>' +
        '<tr><td>Conscientiousness</td><td>Position sizing discipline, cut-loss patterns, process rigour</td></tr>' +
        '<tr><td>Openness</td><td>Complexity tolerance, uncertainty tolerance, creative thinking</td></tr>' +
    '</table>';

    var comparisonTable = '<table class="pn-table">' +
        '<tr><th>Framework</th><th>Verdict</th><th>Reason</th></tr>' +
        '<tr><td>MBTI</td><td><span class="pn-verdict-rejected">Rejected</span></td><td>Poor test-retest reliability; no predictive validity in finance</td></tr>' +
        '<tr><td>Big Five (NEO-PI-R)</td><td><span class="pn-verdict-partial">Strong but incomplete</span></td><td>Requires separate Dark Triad instrument</td></tr>' +
        '<tr><td>Hogan HPI + HDS</td><td><span class="pn-verdict-partial">Excellent but expensive</span></td><td>US$30-75/admin; requires certified practitioners</td></tr>' +
        '<tr><td>HEXACO-60</td><td><span class="pn-verdict-selected">Selected</span></td><td>Sixth factor captures dark personality variance natively; strong reliability; low cost</td></tr>' +
    '</table>';

    return '<div class="pn-assessment-section">' +
        '<div class="pn-section-label">Psychometric Foundation</div>' +
        '<h2 class="pn-section-title">Building the Profile</h2>' +
        '<p class="pn-section-subtitle">A 20-minute assessment combining validated psychological instruments with investment-specific scenarios. No corporate HR exercises. No Likert scale hand-waving.</p>' +
        '<div class="pn-accordion">' +
            renderAccordionItem('HEXACO-60 Personality Inventory', '~10 min | 60 items',
                '<p class="pn-accordion-desc">Six-factor personality model measuring Honesty-Humility, Emotionality, Extraversion, Agreeableness, Conscientiousness, and Openness. The critical sixth factor (Honesty-Humility) captures overconfidence, ego investment, and fiduciary orientation without a separate Dark Triad instrument.</p>' +
                '<div class="pn-accordion-cred">Cronbach\u2019s \u03b1 = .73\u2013.81 | Replicated across 12+ language lexical studies</div>' +
                hexacoTable, true) +
            renderAccordionItem('Cognitive Reflection Test', '~3 min | 4 items',
                '<p class="pn-accordion-desc">An objective performance test, not self-report. Measures System 1 vs System 2 dominance. Ceiling effect expected (40-60% of PMs score 4/4), but error patterns are diagnostic: an anchoring error reveals different vulnerability than a substitution error.</p>', false) +
            renderAccordionItem('Investment Philosophy & Delivery Preferences', '~3 min | 8 forced-choice items',
                '<p class="pn-accordion-desc">No Likert scales. Forced binary choices to defeat social desirability bias. Covers analytical orientation, time horizon, concentration, contrarian tendency, detail appetite, alert preference, format, and decision pace.</p>', false) +
            renderAccordionItem('Scenario-Based Bias Elicitation', '~4 min | 3 scenarios',
                '<p class="pn-accordion-desc">Each scenario targets a specific bias cluster. Scenario 1: anchoring + disposition effect via a loss position. Scenario 2: confirmation bias via mixed evidence. Scenario 3: herding + contrarian overcorrection via consensus divergence.</p>', false) +
        '</div>' +
        '<div class="pn-assessment-note">Emotional Architecture is derived entirely from HEXACO scores and scenario responses. Zero additional manager time. Every derived dimension is marked \u201cEstimated\u201d and refined through the continuous learning loop.</div>' +
        '<div class="pn-comparison-table">' +
            '<div class="pn-section-label">Why HEXACO?</div>' +
            comparisonTable +
        '</div>' +
    '</div>';
}

function renderAccordionItem(title, time, bodyHtml, openByDefault) {
    var openClass = openByDefault ? ' open' : '';
    return '<div class="pn-accordion-item">' +
        '<div class="pn-accordion-header' + openClass + '">' +
            '<div><div class="pn-accordion-title">' + title + '</div><div class="pn-accordion-time">' + time + '</div></div>' +
            '<span class="pn-accordion-chevron">\u25BC</span>' +
        '</div>' +
        '<div class="pn-accordion-body' + openClass + '">' +
            '<div class="pn-accordion-body-inner">' + bodyHtml + '</div>' +
        '</div>' +
    '</div>';
}

// ============================================================
// RENDER: CONTINUOUS LEARNING
// ============================================================

function renderLearning() {
    var dimensions = [
        { title: 'Signal-Action Mapping', desc: 'Which signals does the manager act on? Dismiss? Read but not act on? Reveals actual cognitive preferences and bias patterns.', threshold: 'Threshold: 20 signal-action pairs' },
        { title: 'Delivery-Engagement Mapping', desc: 'Which framing styles produced deeper engagement? Which were skimmed? Reveals optimal structural preferences.', threshold: 'Threshold: 15 delivery-engagement pairs' },
        { title: 'Prediction-Outcome Mapping', desc: 'When the manager expressed high confidence, were they right? Reveals confidence calibration by domain.', threshold: 'Threshold: 10 prediction-outcome pairs' },
        { title: 'Bias Manifestation Tracking', desc: 'Under what specific conditions do biases actually manifest? Builds conditional modifiers, not categorical labels.', threshold: 'Threshold: 15 bias-context observations' },
        { title: 'Stress-State Detection', desc: 'Behavioural anomalies suggesting the manager is under pressure. The system never tells the manager they appear stressed. It silently adjusts delivery.', threshold: 'Continuous passive monitoring' }
    ];

    var timelineHtml = '';
    for (var i = 0; i < dimensions.length; i++) {
        timelineHtml += '<div class="pn-timeline-item">' +
            '<div class="pn-timeline-dot"></div>' +
            '<div class="pn-timeline-title">' + dimensions[i].title + '</div>' +
            '<div class="pn-timeline-desc">' + dimensions[i].desc + '</div>' +
            '<div class="pn-timeline-threshold">' + dimensions[i].threshold + '</div>' +
        '</div>';
    }

    var principlesHtml = '<li>Never alter substance. Framing, emphasis, sequence, detail depth, and counter-bias interventions only.</li>' +
        '<li>Firm constraints override everything. Layer 1 is a hard filter.</li>' +
        '<li>Revealed preference over stated preference. After 20+ signal-action pairs, weight observed behaviour 3:1.</li>' +
        '<li>Counter-bias interventions require evidence. Specific observed patterns in specific conditions.</li>' +
        '<li>Smart PMs require smart calibration. High-CRT individuals rationalise directive bias warnings.</li>' +
        '<li>Discomfort is not a delivery failure. The goal is better decisions, not comfortable managers.</li>';

    return '<div class="pn-learning-section">' +
        '<div class="pn-section-label">Continuous Improvement</div>' +
        '<h2 class="pn-section-title">The System Learns</h2>' +
        '<p class="pn-section-subtitle">The 20-minute assessment produces initial priors, not ground truth. After 20+ signal-action pairs, observed behaviour outweighs stated preferences 3:1.</p>' +
        '<div class="pn-timeline">' + timelineHtml + '</div>' +
        '<div class="pn-closing">' +
            '<div class="pn-closing-text">A manager who says \u201cI want full evidence\u201d but consistently skips to the conclusion gets conclusion-first delivery. What managers do reveals more than what they say.</div>' +
        '</div>' +
        '<button class="pn-request-btn" onclick="navigate(\'about\')">Request Access</button>' +
        '<div class="pn-principles">' +
            '<div class="pn-principles-title">Six Inviolable Principles</div>' +
            '<ul class="pn-principles-list">' + principlesHtml + '</ul>' +
        '</div>' +
    '</div>';
}

// ============================================================
// OUTPUT PANEL RENDERING
// ============================================================

function pnUpdateOutput() {
    var panel = document.getElementById('pn-output-panel');
    if (!panel) return;

    var mgr = pnState.selectedManager;
    var scn = pnState.selectedScenario;

    if (!mgr) {
        panel.innerHTML = '<div class="pn-output-empty">Select a manager above to see their calibrated delivery</div>';
        return;
    }

    if (pnState.compareMode && pnState.compareManager) {
        panel.innerHTML = renderCompareView(mgr, pnState.compareManager, scn);
    } else if (pnState.compareMode && !pnState.compareManager) {
        panel.innerHTML = renderSingleView(mgr, scn) +
            '<div class="pn-output-empty" style="border-top: 1px solid var(--border); padding: var(--space-md);">Now select a second manager to compare</div>';
    } else {
        panel.innerHTML = renderSingleView(mgr, scn);
    }

    // Bind annotation toggles
    panel.querySelectorAll('.pn-annotation-header').forEach(function(header) {
        header.addEventListener('click', function() {
            this.classList.toggle('open');
            this.nextElementSibling.classList.toggle('open');
        });
    });

    // Bind compare raw toggle
    var rawToggle = panel.querySelector('.pn-compare-raw-toggle');
    if (rawToggle) {
        rawToggle.addEventListener('click', function() {
            this.classList.toggle('open');
            this.nextElementSibling.classList.toggle('open');
        });
    }
}

function renderSingleView(mgrId, scnId) {
    var mgr = PN_MANAGERS[mgrId];
    var scn = PN_SCENARIOS[scnId];
    var delivery = PN_DELIVERIES[scnId][mgrId];

    return '<div class="pn-output-split">' +
        '<div class="pn-output-raw">' +
            '<div class="pn-output-header">Upstream Analysis <span class="pn-output-header-badge">Identical for all managers</span></div>' +
            '<div class="pn-output-body">' + escapeHtml(scn.rawSignal) + '</div>' +
        '</div>' +
        '<div class="pn-output-calibrated">' +
            '<div class="pn-output-header">Calibrated Delivery</div>' +
            '<div class="pn-output-manager-name">' + mgr.name + ' \u2014 ' + mgr.fund + '</div>' +
            renderTraits(mgr.traits) +
            '<div class="pn-output-body">' + escapeHtml(delivery.body) + '</div>' +
            renderAnnotations(delivery.annotations) +
        '</div>' +
    '</div>';
}

function renderCompareView(mgrId1, mgrId2, scnId) {
    var mgr1 = PN_MANAGERS[mgrId1];
    var mgr2 = PN_MANAGERS[mgrId2];
    var scn = PN_SCENARIOS[scnId];
    var delivery1 = PN_DELIVERIES[scnId][mgrId1];
    var delivery2 = PN_DELIVERIES[scnId][mgrId2];

    return '<div class="pn-compare-raw">' +
            '<button class="pn-compare-raw-toggle">Raw Signal <span class="pn-chevron">\u25BC</span></button>' +
            '<div class="pn-compare-raw-body">' +
                '<div class="pn-output-body" style="padding: var(--space-sm) 0; font-family: var(--font-data); font-size: 0.75rem; color: var(--text-muted);">' + escapeHtml(scn.rawSignal) + '</div>' +
            '</div>' +
        '</div>' +
        '<div class="pn-compare-split">' +
            '<div class="pn-compare-col">' +
                '<div class="pn-output-header">Manager A</div>' +
                '<div class="pn-output-manager-name">' + mgr1.name + '</div>' +
                '<div style="margin-bottom: var(--space-sm); font-size: 0.75rem; color: var(--text-muted);">' + mgr1.fund + '</div>' +
                renderTraits(mgr1.traits) +
                '<div class="pn-output-body">' + escapeHtml(delivery1.body) + '</div>' +
                renderAnnotations(delivery1.annotations) +
            '</div>' +
            '<div class="pn-compare-col">' +
                '<div class="pn-output-header">Manager B</div>' +
                '<div class="pn-output-manager-name">' + mgr2.name + '</div>' +
                '<div style="margin-bottom: var(--space-sm); font-size: 0.75rem; color: var(--text-muted);">' + mgr2.fund + '</div>' +
                renderTraits(mgr2.traits) +
                '<div class="pn-output-body">' + escapeHtml(delivery2.body) + '</div>' +
                renderAnnotations(delivery2.annotations) +
            '</div>' +
        '</div>';
}

function renderTraits(traits) {
    var html = '<div class="pn-manager-traits" style="margin-bottom: var(--space-md);">';
    for (var i = 0; i < traits.length; i++) {
        html += '<span class="pn-trait pn-trait-' + traits[i].type + '">' + traits[i].label + '</span>';
    }
    return html + '</div>';
}

function renderAnnotations(annotations) {
    if (!annotations || annotations.length === 0) return '';
    var html = '<div class="pn-annotations">' +
        '<div class="pn-annotations-title">Calibration Annotations</div>';
    for (var i = 0; i < annotations.length; i++) {
        var a = annotations[i];
        html += '<div class="pn-annotation">' +
            '<div class="pn-annotation-header">' +
                '<span class="pn-badge pn-badge-' + a.type + '">' + a.badge + '</span>' +
                '<span style="flex: 1; font-size: 0.72rem;">Step ' + a.step + '</span>' +
                '<span class="pn-chevron">\u25BC</span>' +
            '</div>' +
            '<div class="pn-annotation-body">' +
                '<div class="pn-annotation-body-inner">' + escapeHtml(a.detail) + '</div>' +
            '</div>' +
        '</div>';
    }
    return html + '</div>';
}

function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/\n/g, '<br>');
}

// ============================================================
// INITIALIZATION & EVENT BINDING
// ============================================================

window.initPersonalisationDemo = function() {
    // Manager card clicks
    document.querySelectorAll('.pn-manager-card').forEach(function(card) {
        card.addEventListener('click', function() {
            var managerId = this.dataset.manager;
            if (pnState.compareMode) {
                if (managerId === pnState.selectedManager) return;
                pnState.compareManager = managerId;
                document.querySelectorAll('.pn-manager-card').forEach(function(c) {
                    c.classList.remove('compare-selected');
                });
                this.classList.add('compare-selected');
            } else {
                pnState.selectedManager = managerId;
                pnState.compareManager = null;
                document.querySelectorAll('.pn-manager-card').forEach(function(c) {
                    c.classList.remove('selected');
                    c.classList.remove('compare-selected');
                });
                this.classList.add('selected');
            }
            pnUpdateOutput();
        });
    });

    // Scenario button clicks
    document.querySelectorAll('.pn-scenario-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            pnState.selectedScenario = this.dataset.scenario;
            document.querySelectorAll('.pn-scenario-btn').forEach(function(b) {
                b.classList.remove('selected');
            });
            this.classList.add('selected');
            pnUpdateOutput();
        });
    });

    // Compare toggle
    var viewToggle = document.getElementById('pn-view-toggle');
    if (viewToggle) {
        viewToggle.querySelectorAll('button').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var mode = this.dataset.mode;
                viewToggle.querySelectorAll('button').forEach(function(b) { b.classList.remove('active'); });
                this.classList.add('active');
                pnState.compareMode = (mode === 'compare');
                if (!pnState.compareMode) {
                    pnState.compareManager = null;
                    document.querySelectorAll('.pn-manager-card').forEach(function(c) {
                        c.classList.remove('compare-selected');
                    });
                }
                pnUpdateOutput();
            });
        });
    }

    // CTA scroll button
    var ctaBtn = document.getElementById('pn-cta-scroll');
    if (ctaBtn) {
        ctaBtn.addEventListener('click', function() {
            var target = document.getElementById('pn-demo-anchor');
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }

    // Accordion headers
    document.querySelectorAll('.pn-accordion-header').forEach(function(header) {
        header.addEventListener('click', function() {
            this.classList.toggle('open');
            var body = this.nextElementSibling;
            if (body) body.classList.toggle('open');
        });
    });
};

})();
