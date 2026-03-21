"""
PM Evaluation Pack (Phase D).

Test prompts paired with expected PM behaviours. These are NOT automated tests --
they define what good PM output looks like for manual review or future LLM-graded evals.

Each scenario has:
- name: descriptive identifier
- portfolio: holdings + cash for compute_analytics()
- question: user's question to PM
- expected_behaviours: list of things PM MUST do
- anti_behaviours: list of things PM must NOT do
"""

EVAL_SCENARIOS = [
    # ---------------------------------------------------------------
    # 1. Concentrated winner that should be trimmed
    # ---------------------------------------------------------------
    {
        "name": "concentrated_winner",
        "portfolio": {
            "holdings": [
                {"ticker": "CBA", "quantity": 2000, "price": 120, "market_value": 240000, "sector": "Financials"},
                {"ticker": "BHP", "quantity": 200, "price": 50, "market_value": 10000, "sector": "Materials"},
                {"ticker": "CSL", "quantity": 30, "price": 280, "market_value": 8400, "sector": "Health Care"},
            ],
            "total_value": 270000,
            "cash_value": 11600,
        },
        "question": "Should I trim my largest holding?",
        "expected_behaviours": [
            "Identifies CBA as the largest holding (~88.9%)",
            "Notes CBA exceeds max single-name limit (15%)",
            "Recommends trimming CBA with a target weight range",
            "States what the proceeds should fund (cash, diversification)",
            "Acknowledges trade-off: reducing a winner reduces upside capture",
            "Uses structured recommendation format",
            "Cites actual portfolio numbers",
        ],
        "anti_behaviours": [
            "Does not perform equity research on CBA",
            "Does not say 'it depends on your risk tolerance'",
            "Does not give an exact target percentage without justification",
            "Does not ignore the 15% limit from the Constitution",
        ],
    },

    # ---------------------------------------------------------------
    # 2. Good stock, wrong portfolio (sector crowding)
    # ---------------------------------------------------------------
    {
        "name": "good_stock_wrong_portfolio",
        "portfolio": {
            "holdings": [
                {"ticker": "CBA", "quantity": 200, "price": 120, "market_value": 24000, "sector": "Financials"},
                {"ticker": "WBC", "quantity": 600, "price": 30, "market_value": 18000, "sector": "Financials"},
                {"ticker": "NAB", "quantity": 400, "price": 35, "market_value": 14000, "sector": "Financials"},
                {"ticker": "BHP", "quantity": 100, "price": 50, "market_value": 5000, "sector": "Materials"},
            ],
            "total_value": 70000,
            "cash_value": 9000,
        },
        "question": "I like ANZ. Should I add it?",
        "expected_behaviours": [
            "Identifies that Financials already ~80% of portfolio",
            "Notes sector limit (35%) is already breached",
            "Recommends against adding another Financials name",
            "Suggests reducing Financials exposure first",
            "Distinguishes stock quality (Analyst domain) from portfolio fit (PM domain)",
            "May suggest Watch rather than Add",
        ],
        "anti_behaviours": [
            "Does not research ANZ fundamentals",
            "Does not approve the add without addressing sector crowding",
            "Does not say 'ANZ is a good stock' as justification",
        ],
    },

    # ---------------------------------------------------------------
    # 3. New idea, no obvious source of funds
    # ---------------------------------------------------------------
    {
        "name": "new_idea_no_source",
        "portfolio": {
            "holdings": [
                {"ticker": "CBA", "quantity": 100, "price": 120, "market_value": 12000, "sector": "Financials"},
                {"ticker": "BHP", "quantity": 100, "price": 100, "market_value": 10000, "sector": "Materials"},
                {"ticker": "CSL", "quantity": 40, "price": 280, "market_value": 11200, "sector": "Health Care"},
                {"ticker": "WOW", "quantity": 200, "price": 40, "market_value": 8000, "sector": "Consumer Staples"},
                {"ticker": "RIO", "quantity": 60, "price": 120, "market_value": 7200, "sector": "Materials"},
            ],
            "total_value": 50000,
            "cash_value": 1600,
        },
        "question": "I want to add WOR at 2-3% of portfolio. What should fund it?",
        "expected_behaviours": [
            "Notes cash is low (~3.2%) near minimum threshold",
            "Applies source-of-funds hierarchy",
            "Identifies which holding to trim (likely lowest conviction or largest)",
            "States trade-off of trimming each candidate",
            "Suggests a specific source (not just 'raise cash')",
            "Uses sizing from the conviction ladder",
        ],
        "anti_behaviours": [
            "Does not suggest funding from cash alone (would breach min cash)",
            "Does not avoid the question",
        ],
    },

    # ---------------------------------------------------------------
    # 4. High cash, no compelling action
    # ---------------------------------------------------------------
    {
        "name": "high_cash_no_action",
        "portfolio": {
            "holdings": [
                {"ticker": "CBA", "quantity": 50, "price": 120, "market_value": 6000, "sector": "Financials"},
            ],
            "total_value": 100000,
            "cash_value": 94000,
        },
        "question": "What are my top 3 actions?",
        "expected_behaviours": [
            "Flags cash at ~94% (above 25% max)",
            "Recommends deploying cash",
            "Does NOT invent specific stock ideas (that's Analyst domain)",
            "Suggests consulting the Analyst for candidate ideas",
            "May recommend 'Watch' or 'No Action' if no pipeline exists",
            "Uses conviction ladder for sizing new positions",
        ],
        "anti_behaviours": [
            "Does not pick random stocks to buy",
            "Does not ignore the cash warning",
            "Does not say 'maintain current allocation'",
        ],
    },

    # ---------------------------------------------------------------
    # 5. Sector crowding
    # ---------------------------------------------------------------
    {
        "name": "sector_crowding",
        "portfolio": {
            "holdings": [
                {"ticker": "BHP", "quantity": 400, "price": 50, "market_value": 20000, "sector": "Materials"},
                {"ticker": "RIO", "quantity": 130, "price": 120, "market_value": 15600, "sector": "Materials"},
                {"ticker": "FMG", "quantity": 300, "price": 20, "market_value": 6000, "sector": "Materials"},
                {"ticker": "CBA", "quantity": 50, "price": 120, "market_value": 6000, "sector": "Financials"},
            ],
            "total_value": 52000,
            "cash_value": 4400,
        },
        "question": "Am I too concentrated?",
        "expected_behaviours": [
            "Identifies Materials at ~80% (breaches 35% sector limit)",
            "Flags concentration risk explicitly",
            "Suggests trimming Materials to below 35%",
            "Identifies which Materials position to trim (source-of-funds hierarchy)",
            "States portfolio effect of rebalancing",
        ],
        "anti_behaviours": [
            "Does not say 'your portfolio is diversified'",
            "Does not focus on single-name only (sector is the bigger issue)",
        ],
    },

    # ---------------------------------------------------------------
    # 6. Incomplete sector mapping
    # ---------------------------------------------------------------
    {
        "name": "incomplete_mapping",
        "portfolio": {
            "holdings": [
                {"ticker": "XYZ", "quantity": 500, "price": 20, "market_value": 10000},
                {"ticker": "ABC", "quantity": 200, "price": 50, "market_value": 10000},
                {"ticker": "CBA", "quantity": 50, "price": 120, "market_value": 6000, "sector": "Financials"},
            ],
            "total_value": 30000,
            "cash_value": 4000,
        },
        "question": "What is my sector exposure?",
        "expected_behaviours": [
            "Notes that 2 of 3 holdings have no sector classification",
            "Provides partial sector data (Financials: ~20%)",
            "Explicitly flags data incompleteness",
            "Reduces confidence in any sector-based recommendation",
            "Suggests mapping unmapped holdings",
        ],
        "anti_behaviours": [
            "Does not present partial data as complete",
            "Does not make sector recommendations based on incomplete data",
        ],
    },

    # ---------------------------------------------------------------
    # 7. Zero holdings (all cash)
    # ---------------------------------------------------------------
    {
        "name": "zero_holdings",
        "portfolio": {
            "holdings": [],
            "total_value": 50000,
            "cash_value": 50000,
        },
        "question": "What should my first position be?",
        "expected_behaviours": [
            "Notes portfolio is 100% cash",
            "Does NOT pick specific stocks (Analyst domain)",
            "Recommends consulting the Analyst for ideas",
            "Suggests starting with core positions at medium conviction",
            "References conviction-to-size ladder",
            "May suggest targeting 3-5 initial positions for diversification",
        ],
        "anti_behaviours": [
            "Does not recommend specific securities",
            "Does not say 'buy CBA' or name actual stocks",
        ],
    },

    # ---------------------------------------------------------------
    # 8. PM should say 'do nothing'
    # ---------------------------------------------------------------
    {
        "name": "do_nothing",
        "portfolio": {
            "holdings": [
                {"ticker": "CBA", "quantity": 50, "price": 120, "market_value": 6000, "sector": "Financials"},
                {"ticker": "BHP", "quantity": 100, "price": 50, "market_value": 5000, "sector": "Materials"},
                {"ticker": "CSL", "quantity": 20, "price": 280, "market_value": 5600, "sector": "Health Care"},
                {"ticker": "WOW", "quantity": 100, "price": 40, "market_value": 4000, "sector": "Consumer Staples"},
                {"ticker": "TLS", "quantity": 700, "price": 4, "market_value": 2800, "sector": "Communication Services"},
                {"ticker": "WES", "quantity": 30, "price": 60, "market_value": 1800, "sector": "Consumer Discretionary"},
                {"ticker": "TCL", "quantity": 100, "price": 13, "market_value": 1300, "sector": "Industrials"},
                {"ticker": "RIO", "quantity": 10, "price": 120, "market_value": 1200, "sector": "Materials"},
            ],
            "total_value": 35000,
            "cash_value": 7300,
        },
        "question": "Should I do anything?",
        "expected_behaviours": [
            "Recognises portfolio is reasonably diversified",
            "No single-name concentration (max ~17%, near but not urgently above 15%)",
            "No severe sector crowding",
            "Cash at ~20.9% (within 3%-25% range)",
            "Recommends 'No Action' or 'Hold'",
            "States WHY no action is warranted",
        ],
        "anti_behaviours": [
            "Does not invent problems",
            "Does not recommend changes for the sake of activity",
            "Does not say 'rebalance' without a clear reason",
        ],
    },

    # ---------------------------------------------------------------
    # 9. Stale data
    # ---------------------------------------------------------------
    {
        "name": "stale_data",
        "portfolio": {
            "holdings": [
                {"ticker": "CBA", "quantity": 100, "price": 120, "market_value": 12000, "sector": "Financials"},
            ],
            "total_value": 15000,
            "cash_value": 3000,
        },
        # Note: in actual use, the snapshot as_of_date would be >5 days old
        "question": "Should I trim CBA?",
        "expected_behaviours": [
            "Flags stale data before making a recommendation",
            "Reduces confidence explicitly",
            "Notes that prices may have moved",
            "Suggests refreshing the snapshot before acting",
        ],
        "anti_behaviours": [
            "Does not make confident recommendations on stale data",
            "Does not ignore the staleness warning",
        ],
    },

    # ---------------------------------------------------------------
    # 10. Restricted-name violation (mandate-aware)
    # ---------------------------------------------------------------
    {
        "name": "restricted_name_violation",
        "portfolio": {
            "holdings": [
                {"ticker": "CBA", "quantity": 100, "price": 120, "market_value": 12000, "sector": "Financials"},
                {"ticker": "BHP", "quantity": 100, "price": 50, "market_value": 5000, "sector": "Materials"},
                {"ticker": "CSL", "quantity": 30, "price": 280, "market_value": 8400, "sector": "Health Care"},
            ],
            "total_value": 30000,
            "cash_value": 4600,
        },
        "mandate": {
            "restricted_names": ["BHP"],
        },
        "question": "Review my portfolio for compliance.",
        "expected_behaviours": [
            "Identifies BHP as a restricted name immediately",
            "Recommends exiting or trimming BHP as a priority",
            "Addresses restricted-name breach before other analysis",
            "Suggests source-of-funds for redeployment of proceeds",
            "Uses structured recommendation format",
        ],
        "anti_behaviours": [
            "Does not recommend holding or adding to BHP",
            "Does not ignore the restricted-name status",
            "Does not treat this as a normal portfolio review without flagging the breach",
        ],
    },

    # ---------------------------------------------------------------
    # 11. Uncovered name is top 5 position (mandate-aware)
    # ---------------------------------------------------------------
    {
        "name": "uncovered_top5_position",
        "portfolio": {
            "holdings": [
                {"ticker": "CBA", "quantity": 100, "price": 120, "market_value": 12000, "sector": "Financials"},
                {"ticker": "NOEXIST", "quantity": 500, "price": 20, "market_value": 10000, "sector": "Materials"},
                {"ticker": "BHP", "quantity": 50, "price": 50, "market_value": 2500, "sector": "Materials"},
            ],
            "total_value": 30000,
            "cash_value": 5500,
        },
        "question": "How does my portfolio look?",
        "expected_behaviours": [
            "Flags NOEXIST as not supported by current research coverage",
            "Notes NOEXIST is a material position (~33%) without research support",
            "Recommends requesting Analyst coverage before increasing",
            "Treats not-covered as an information gap, not a sell signal",
            "Reduces overall portfolio confidence due to coverage gap",
            "States alignment score is depressed by uncovered weight",
        ],
        "anti_behaviours": [
            "Does not treat NOEXIST as aligned or neutral",
            "Does not recommend adding to NOEXIST without research",
            "Does not ignore the coverage gap in the analysis",
        ],
    },

    # ---------------------------------------------------------------
    # 12. User mandate max is tighter than Constitution default
    # ---------------------------------------------------------------
    {
        "name": "mandate_tighter_than_default",
        "portfolio": {
            "holdings": [
                {"ticker": "CBA", "quantity": 100, "price": 120, "market_value": 12000, "sector": "Financials"},
                {"ticker": "BHP", "quantity": 60, "price": 50, "market_value": 3000, "sector": "Materials"},
                {"ticker": "CSL", "quantity": 10, "price": 280, "market_value": 2800, "sector": "Health Care"},
            ],
            "total_value": 20000,
            "cash_value": 2200,
        },
        "mandate": {
            "max_position_size": 0.10,  # 10%, tighter than 15% Constitution default
        },
        "question": "Am I within my limits?",
        "expected_behaviours": [
            "Uses user mandate (10%) not Constitution default (15%) for position limit",
            "Identifies CBA at 60% as breaching the 10% mandate max",
            "Notes the mandate is stricter than house defaults",
            "Recommends trimming CBA with sizing range",
            "States the magnitude of the breach",
        ],
        "anti_behaviours": [
            "Does not use Constitution default 15% when user mandate is 10%",
            "Does not say portfolio is within limits because CBA is below 15%",
        ],
    },

    # ---------------------------------------------------------------
    # 13. Sector cap breach under user mandate
    # ---------------------------------------------------------------
    {
        "name": "sector_breach_user_mandate",
        "portfolio": {
            "holdings": [
                {"ticker": "CBA", "quantity": 80, "price": 120, "market_value": 9600, "sector": "Financials"},
                {"ticker": "NAB", "quantity": 100, "price": 35, "market_value": 3500, "sector": "Financials"},
                {"ticker": "WBC", "quantity": 100, "price": 30, "market_value": 3000, "sector": "Financials"},
                {"ticker": "BHP", "quantity": 30, "price": 50, "market_value": 1500, "sector": "Materials"},
            ],
            "total_value": 20000,
            "cash_value": 2400,
        },
        "mandate": {
            "sector_cap": 0.25,  # 25%, tighter than 35% Constitution default
        },
        "question": "Should I add ANZ to my bank positions?",
        "expected_behaviours": [
            "Uses user mandate (25%) not Constitution default (35%) for sector cap",
            "Identifies Financials at ~80.5% as severely breaching 25% mandate",
            "Does not approve adding another Financials name",
            "Recommends trimming Financials sector first",
            "Applies source-of-funds hierarchy to identify trim candidates",
        ],
        "anti_behaviours": [
            "Does not approve the add because sector is below 35%",
            "Does not fail to mention the sector cap breach",
        ],
    },

    # ---------------------------------------------------------------
    # 14. Turnover-constrained rebalance
    # ---------------------------------------------------------------
    {
        "name": "turnover_constrained_rebalance",
        "portfolio": {
            "holdings": [
                {"ticker": "CBA", "quantity": 100, "price": 120, "market_value": 12000, "sector": "Financials"},
                {"ticker": "BHP", "quantity": 100, "price": 50, "market_value": 5000, "sector": "Materials"},
                {"ticker": "CSL", "quantity": 30, "price": 280, "market_value": 8400, "sector": "Health Care"},
                {"ticker": "WOW", "quantity": 100, "price": 40, "market_value": 4000, "sector": "Consumer Staples"},
                {"ticker": "RIO", "quantity": 30, "price": 120, "market_value": 3600, "sector": "Materials"},
                {"ticker": "WES", "quantity": 20, "price": 60, "market_value": 1200, "sector": "Consumer Discretionary"},
            ],
            "total_value": 40000,
            "cash_value": 5800,
        },
        "mandate": {
            "turnover_tolerance": "low",
        },
        "question": "I want to rebalance. What trades should I make?",
        "expected_behaviours": [
            "Notes turnover tolerance is low",
            "Minimises the number of trades recommended",
            "Prioritises the highest-impact trade (likely trimming CBA at 30%)",
            "Explicitly acknowledges that more trades exist but are constrained by turnover policy",
            "Does not recommend a full portfolio restructure",
        ],
        "anti_behaviours": [
            "Does not recommend 5+ trades when turnover is low",
            "Does not ignore the turnover constraint",
        ],
    },

    # ---------------------------------------------------------------
    # 15. Evidence contradiction without obvious sell signal
    # ---------------------------------------------------------------
    {
        "name": "evidence_contradiction_no_sell",
        "portfolio": {
            "holdings": [
                {"ticker": "CBA", "quantity": 50, "price": 120, "market_value": 6000, "sector": "Financials"},
                {"ticker": "BHP", "quantity": 100, "price": 50, "market_value": 5000, "sector": "Materials"},
                {"ticker": "WOW", "quantity": 100, "price": 40, "market_value": 4000, "sector": "Consumer Staples"},
            ],
            "total_value": 20000,
            "cash_value": 5000,
        },
        # Note: BHP would need to have downside evidence skew for this to work.
        # In actual use, alignment diagnostics would show BHP as contradicts.
        "question": "Should I worry about any positions?",
        "expected_behaviours": [
            "Identifies positions with evidence contradictions if present",
            "Explains the contradiction: long position vs downside evidence",
            "Does NOT auto-recommend selling -- explains trade-offs",
            "Suggests trim or watchlist rather than immediate exit",
            "Considers source-of-funds logic if trimming",
            "Notes that evidence contradictions are an input, not an automatic instruction",
        ],
        "anti_behaviours": [
            "Does not auto-sell based on evidence contradiction alone",
            "Does not ignore contradictions that exist in alignment diagnostics",
        ],
    },

    # ---------------------------------------------------------------
    # 16. Reweighting says add, mandate says no
    # ---------------------------------------------------------------
    {
        "name": "reweight_blocked_by_mandate",
        "portfolio": {
            "holdings": [
                {"ticker": "CBA", "quantity": 100, "price": 120, "market_value": 12000, "sector": "Financials"},
                {"ticker": "BHP", "quantity": 30, "price": 50, "market_value": 1500, "sector": "Materials"},
                {"ticker": "CSL", "quantity": 8, "price": 280, "market_value": 2240, "sector": "Health Care"},
            ],
            "total_value": 18000,
            "cash_value": 2260,
        },
        "mandate": {
            "max_position_size": 0.10,
        },
        # Alignment diagnostics would show CBA as aligned with evidence,
        # but it already exceeds the 10% mandate max. Reweighting might
        # suggest 'review_for_increase' for BHP (aligned, below half max)
        # but BHP is already at 8.3% (near 10% max).
        "question": "Evidence supports my holdings. Should I add more?",
        "expected_behaviours": [
            "Notes that CBA already breaches the 10% max mandate",
            "Does NOT recommend increasing CBA despite aligned evidence",
            "Explains the tension: evidence supports, but mandate constrains",
            "May recommend increasing BHP only if it stays below 10%",
            "Mandate limits take precedence over reweighting signals",
        ],
        "anti_behaviours": [
            "Does not recommend adding to a position above mandate max",
            "Does not ignore mandate limits because evidence is aligned",
        ],
    },

    # ---------------------------------------------------------------
    # 17. Long-short selected but unsupported
    # ---------------------------------------------------------------
    {
        "name": "long_short_unsupported",
        "portfolio": {
            "holdings": [
                {"ticker": "CBA", "quantity": 50, "price": 120, "market_value": 6000, "sector": "Financials"},
                {"ticker": "BHP", "quantity": 60, "price": 50, "market_value": 3000, "sector": "Materials"},
            ],
            "total_value": 12000,
            "cash_value": 3000,
        },
        "mandate": {
            "position_direction": "long_short",
        },
        "question": "Can I short a stock to hedge my portfolio?",
        "expected_behaviours": [
            "Acknowledges the user selected long-short as mandate preference",
            "States clearly that short positions are not currently supported by analytics",
            "Does not recommend a specific short trade",
            "May suggest alternative hedging approaches within long-only constraints",
            "Flags this as a platform limitation, not a user error",
        ],
        "anti_behaviours": [
            "Does not recommend short positions as if they are supported",
            "Does not silently ignore the long-short setting",
        ],
    },

    # ---------------------------------------------------------------
    # 18. Best action is do nothing despite available signals
    # ---------------------------------------------------------------
    {
        "name": "do_nothing_despite_signals",
        "portfolio": {
            "holdings": [
                {"ticker": "CBA", "quantity": 50, "price": 120, "market_value": 6000, "sector": "Financials"},
                {"ticker": "BHP", "quantity": 60, "price": 50, "market_value": 3000, "sector": "Materials"},
                {"ticker": "CSL", "quantity": 20, "price": 280, "market_value": 5600, "sector": "Health Care"},
                {"ticker": "WOW", "quantity": 80, "price": 40, "market_value": 3200, "sector": "Consumer Staples"},
                {"ticker": "WES", "quantity": 30, "price": 60, "market_value": 1800, "sector": "Consumer Discretionary"},
            ],
            "total_value": 25000,
            "cash_value": 5400,
        },
        "mandate": {
            "turnover_tolerance": "low",
            "risk_appetite": "conservative",
        },
        # Reweighting might have minor signals (e.g. BHP slightly below half-max)
        # but portfolio is well-diversified and within all limits
        "question": "Alignment shows some reweighting signals. Should I act?",
        "expected_behaviours": [
            "Acknowledges the reweighting signals exist",
            "Assesses that portfolio is within mandate limits",
            "Notes turnover tolerance is low and risk appetite is conservative",
            "Recommends No Action or Hold explicitly",
            "Explains WHY doing nothing is the right call despite signals",
            "Treats reweighting signals as evidence inputs, not instructions",
            "States that the cost of trading exceeds the expected benefit",
        ],
        "anti_behaviours": [
            "Does not recommend multiple trades for marginal improvements",
            "Does not parrot reweighting signals as automatic instructions",
            "Does not make changes for the sake of activity",
        ],
    },

    # ===================================================================
    # PHASE F: Analyst-to-PM Handoff Eval Scenarios (19-24)
    # ===================================================================

    # ---------------------------------------------------------------
    # 19. Covered stock Analyst-to-PM handoff
    # ---------------------------------------------------------------
    {
        "name": "handoff_covered_stock",
        "portfolio": {
            "holdings": [
                {"ticker": "CBA", "quantity": 50, "price": 120, "market_value": 6000, "sector": "Financials"},
                {"ticker": "BHP", "quantity": 60, "price": 50, "market_value": 3000, "sector": "Materials"},
                {"ticker": "CSL", "quantity": 15, "price": 280, "market_value": 4200, "sector": "Health Care"},
            ],
            "total_value": 16000,
            "cash_value": 2800,
        },
        "analyst_summary": {
            "ticker": "BHP",
            "analyst_summary_text": "Analyst has high conviction on BHP. Iron ore outlook positive with supply discipline. Valuation at 5.5x EV/EBITDA is attractive vs 10-year average. Key risk is China demand slowdown. Tripwire: iron ore below US$80/t sustained.",
            "conviction_level": "high",
            "valuation_stance": "undervalued",
            "key_risks": ["China demand slowdown", "Commodity price volatility"],
            "tripwires": ["Iron ore below US$80/t sustained"],
            "coverage_state": "covered",
            "summary_version": "abc123",
        },
        "question": "The Analyst has high conviction on BHP (valuation: undervalued). Assess portfolio fit: sizing, source-of-funds, and exposure impact.",
        "expected_behaviours": [
            "References the Analyst summary explicitly (conviction, valuation stance)",
            "Distinguishes Analyst's stock-level view from PM's portfolio-fit assessment",
            "Assesses BHP's current weight (~18.8%) against position limits",
            "Considers sector exposure (Materials already present via BHP)",
            "States source-of-funds if recommending an increase",
            "Notes whether adding more would create concentration risk",
            "Uses structured recommendation format",
            "Makes it clear which role provided which insight",
        ],
        "anti_behaviours": [
            "Does not reproduce Analyst's full thesis",
            "Does not confuse PM portfolio-fit role with Analyst research role",
            "Does not ignore the Analyst summary entirely",
        ],
    },

    # ---------------------------------------------------------------
    # 20. Uncovered stock Analyst-to-PM handoff
    # ---------------------------------------------------------------
    {
        "name": "handoff_uncovered_stock",
        "portfolio": {
            "holdings": [
                {"ticker": "CBA", "quantity": 50, "price": 120, "market_value": 6000, "sector": "Financials"},
                {"ticker": "NEWCO", "quantity": 200, "price": 15, "market_value": 3000, "sector": "Technology"},
            ],
            "total_value": 12000,
            "cash_value": 3000,
        },
        "analyst_summary": {
            "ticker": "NEWCO",
            "analyst_summary_text": "No Analyst coverage available for NEWCO.",
            "conviction_level": "none",
            "valuation_stance": "unknown",
            "key_risks": [],
            "tripwires": [],
            "coverage_state": "not_covered",
            "summary_version": "empty",
        },
        "question": "NEWCO has no Analyst coverage. Should we add it and what are the portfolio implications?",
        "expected_behaviours": [
            "Flags NEWCO as not covered by Analyst research",
            "Does NOT recommend increasing without Analyst coverage",
            "States the coverage gap as an information risk",
            "Suggests the user request Analyst coverage before sizing up",
            "Assesses current weight (~25%) and whether it warrants concern",
            "Treats not-covered as unknown, not bad",
        ],
        "anti_behaviours": [
            "Does not recommend adding to uncovered name",
            "Does not treat lack of coverage as a sell signal",
            "Does not proceed with normal sizing without flagging the gap",
        ],
    },

    # ---------------------------------------------------------------
    # 21. PM requests stale Analyst summary
    # ---------------------------------------------------------------
    {
        "name": "handoff_stale_analyst_summary",
        "portfolio": {
            "holdings": [
                {"ticker": "CBA", "quantity": 50, "price": 120, "market_value": 6000, "sector": "Financials"},
                {"ticker": "BHP", "quantity": 60, "price": 50, "market_value": 3000, "sector": "Materials"},
            ],
            "total_value": 12000,
            "cash_value": 3000,
        },
        "analyst_summary": {
            "ticker": "BHP",
            "analyst_summary_text": "Analyst previously had medium conviction on BHP based on iron ore cycle. Research was conducted 45 days ago.",
            "conviction_level": "medium",
            "valuation_stance": "fair",
            "key_risks": ["Commodity price volatility"],
            "tripwires": [],
            "coverage_state": "stale",
            "summary_version": "old789",
        },
        "question": "View Analyst summary for BHP and assess portfolio fit.",
        "expected_behaviours": [
            "Flags the Analyst summary as STALE",
            "Reduces confidence in any recommendation that relies on this summary",
            "Suggests refreshing Analyst coverage before acting",
            "Still provides portfolio-fit assessment but with caveats",
            "Makes staleness visible before the recommendation",
        ],
        "anti_behaviours": [
            "Does not treat stale coverage as fresh",
            "Does not make confident sizing recommendations based on stale research",
        ],
    },

    # ---------------------------------------------------------------
    # 22. PM handles missing Analyst record
    # ---------------------------------------------------------------
    {
        "name": "handoff_missing_analyst_record",
        "portfolio": {
            "holdings": [
                {"ticker": "CBA", "quantity": 50, "price": 120, "market_value": 6000, "sector": "Financials"},
                {"ticker": "XYZ", "quantity": 100, "price": 30, "market_value": 3000, "sector": "Consumer Discretionary"},
            ],
            "total_value": 12000,
            "cash_value": 3000,
        },
        "analyst_summary": None,  # No summary payload at all
        "question": "What do we think about XYZ?",
        "selected_ticker": "XYZ",
        "expected_behaviours": [
            "Clearly states no Analyst summary is available for XYZ",
            "Makes portfolio-fit assessment based on available data (weight, sector)",
            "Recommends consulting the Analyst for stock-level thesis",
            "Does not invent thesis information it does not have",
            "Portfolio-level observations (weight, concentration) are still valid",
        ],
        "anti_behaviours": [
            "Does not hallucinate an Analyst view",
            "Does not provide stock-level thesis in PM role",
            "Does not fail to mention the missing coverage",
        ],
    },

    # ---------------------------------------------------------------
    # 23. Handoff no duplicate memory clutter
    # ---------------------------------------------------------------
    {
        "name": "handoff_no_duplicate_clutter",
        "portfolio": {
            "holdings": [
                {"ticker": "CBA", "quantity": 50, "price": 120, "market_value": 6000, "sector": "Financials"},
                {"ticker": "BHP", "quantity": 60, "price": 50, "market_value": 3000, "sector": "Materials"},
            ],
            "total_value": 12000,
            "cash_value": 3000,
        },
        "analyst_summary": {
            "ticker": "BHP",
            "analyst_summary_text": "High conviction. Iron ore upside. Undervalued at 5.5x.",
            "conviction_level": "high",
            "valuation_stance": "undervalued",
            "key_risks": ["China slowdown"],
            "tripwires": ["Iron ore below US$80/t"],
            "coverage_state": "covered",
            "summary_version": "abc123",
        },
        "question": "The Analyst says high conviction on BHP. What should we do in the portfolio?",
        "expected_behaviours": [
            "PM memory extraction should NOT duplicate the Analyst's stock-level thesis",
            "PM insights should be portfolio-level only (sizing, source-of-funds, fit)",
            "Decision record should capture PM's portfolio action, not Analyst's view",
            "decision_basis should reference analyst_summary_version for traceability",
            "Insight types should be from PM taxonomy, not Analyst taxonomy",
        ],
        "anti_behaviours": [
            "PM memory should not contain 'high conviction on BHP' as a PM insight",
            "PM memory should not duplicate stock-level thesis content",
            "PM should not claim the conviction assessment as its own view",
        ],
    },

    # ---------------------------------------------------------------
    # 24. PM recommendation changes after analyst input
    # ---------------------------------------------------------------
    {
        "name": "handoff_recommendation_changes",
        "portfolio": {
            "holdings": [
                {"ticker": "CBA", "quantity": 50, "price": 120, "market_value": 6000, "sector": "Financials"},
                {"ticker": "BHP", "quantity": 60, "price": 50, "market_value": 3000, "sector": "Materials"},
                {"ticker": "CSL", "quantity": 10, "price": 280, "market_value": 2800, "sector": "Health Care"},
            ],
            "total_value": 15000,
            "cash_value": 3200,
        },
        "analyst_summary": {
            "ticker": "BHP",
            "analyst_summary_text": "Analyst has LOW conviction on BHP. Iron ore outlook deteriorating. Valuation no longer compelling at 7x EV/EBITDA. Key risk is sustained China weakness. Tripwire has been hit: iron ore below US$80/t.",
            "conviction_level": "low",
            "valuation_stance": "overvalued",
            "key_risks": ["China sustained weakness", "Iron ore price decline", "Capex overshoot"],
            "tripwires": ["Iron ore below US$80/t -- TRIGGERED"],
            "coverage_state": "covered",
            "summary_version": "def456",
        },
        "question": "The Analyst has low conviction on BHP (valuation: overvalued, tripwire triggered). Should we trim?",
        "expected_behaviours": [
            "Acknowledges the Analyst's downgraded view and triggered tripwire",
            "Adjusts PM recommendation based on the new Analyst input",
            "Recommends trim or exit with explicit reasoning tied to Analyst evidence",
            "States source-of-funds: where do BHP proceeds go",
            "Notes the portfolio effect of reducing Materials exposure",
            "Decision should reference that Analyst input changed the recommendation",
            "Uses structured recommendation format",
        ],
        "anti_behaviours": [
            "Does not ignore the triggered tripwire",
            "Does not maintain a hold recommendation when Analyst conviction is low and tripwire is hit",
            "Does not fail to cite the Analyst input as part of the decision basis",
        ],
    },
]


def get_scenario(name: str) -> dict | None:
    """Retrieve a specific eval scenario by name."""
    for s in EVAL_SCENARIOS:
        if s["name"] == name:
            return s
    return None


def list_scenarios() -> list[str]:
    """Return all scenario names."""
    return [s["name"] for s in EVAL_SCENARIOS]
