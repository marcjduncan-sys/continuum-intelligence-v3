/* ============================================================
   PERSONALISATION ONBOARDING WIZARD
   5-step wizard: Firm > Strategy > Portfolio > Assessment > Chat
   All scoring happens client-side. Profile saved to localStorage.
   ============================================================ */

(function() {
'use strict';

// =========================================================================
// CONSTANTS & DATA
// =========================================================================

var PN_STEP_LABELS = [
    { num: 1, title: 'Firm', subtitle: 'Institutional context' },
    { num: 2, title: 'Strategy', subtitle: 'Fund mandate' },
    { num: 3, title: 'Portfolio', subtitle: 'Current holdings' },
    { num: 4, title: 'Assessment', subtitle: 'Cognitive profile' },
    { num: 5, title: 'Chat', subtitle: 'Calibrated AI' }
];

// ---------------------------------------------------------------------------
// Step 1: Firm options
// ---------------------------------------------------------------------------

var PN_FIRM_OPTIONS = {
    type: [
        'Superannuation Fund',
        'Insurance Company',
        'Family Office',
        'HNWI Advisor',
        'Boutique Fund Manager',
        'Institutional Fund Manager'
    ],
    aum: [
        '< $500M',
        '$500M - $2B',
        '$2B - $10B',
        '$10B - $50B',
        '$50B+'
    ],
    regulations: [
        'APRA Prudential Standards',
        'SIS Act Compliance',
        'AFSL Conditions',
        'ESG / Responsible Investment',
        'FIRB Reporting'
    ],
    governance: [
        'Sole Decision-Maker',
        'Investment Committee',
        'CIO-Led with IC Oversight',
        'Board-Delegated Authority'
    ]
};

// ---------------------------------------------------------------------------
// Step 2: Fund options
// ---------------------------------------------------------------------------

var PN_FUND_OPTIONS = {
    strategy: [
        'Long Only',
        'Long-Short',
        'Market Neutral',
        'Macro',
        'Multi-Strategy',
        'Event-Driven',
        'Quantitative'
    ],
    geography: [
        'ASX Only',
        'ASX + Global Developed',
        'Global All-Cap',
        'Asia-Pacific',
        'Emerging Markets'
    ],
    benchmark: [
        'S&P/ASX 200',
        'S&P/ASX 300',
        'S&P/ASX Small Ordinaries',
        'MSCI World',
        'Absolute Return',
        'Custom'
    ],
    holdingPeriod: [
        '< 3 months',
        '3-12 months',
        '1-3 years',
        '3-5 years',
        '5+ years'
    ]
};

// ---------------------------------------------------------------------------
// Step 4a: Mini-IPIP Big Five (20 items)
// Donnellan et al. (2006). Validated 20-item short form.
// 4 items per factor. Reverse-coded items marked.
// ---------------------------------------------------------------------------

var PN_IPIP_ITEMS = [
    // Extraversion (E)
    { id: 'E1', text: 'I am the life of the party.', factor: 'E', reverse: false },
    { id: 'E2', text: 'I don\'t talk a lot.', factor: 'E', reverse: true },
    { id: 'E3', text: 'I talk to a lot of different people at parties.', factor: 'E', reverse: false },
    { id: 'E4', text: 'I keep in the background.', factor: 'E', reverse: true },
    // Agreeableness (A)
    { id: 'A1', text: 'I sympathize with others\' feelings.', factor: 'A', reverse: false },
    { id: 'A2', text: 'I am not interested in other people\'s problems.', factor: 'A', reverse: true },
    { id: 'A3', text: 'I feel others\' emotions.', factor: 'A', reverse: false },
    { id: 'A4', text: 'I am not really interested in others.', factor: 'A', reverse: true },
    // Conscientiousness (C)
    { id: 'C1', text: 'I get chores done right away.', factor: 'C', reverse: false },
    { id: 'C2', text: 'I often forget to put things back in their proper place.', factor: 'C', reverse: true },
    { id: 'C3', text: 'I like order.', factor: 'C', reverse: false },
    { id: 'C4', text: 'I make a mess of things.', factor: 'C', reverse: true },
    // Neuroticism (N)
    { id: 'N1', text: 'I have frequent mood swings.', factor: 'N', reverse: false },
    { id: 'N2', text: 'I am relaxed most of the time.', factor: 'N', reverse: true },
    { id: 'N3', text: 'I get upset easily.', factor: 'N', reverse: false },
    { id: 'N4', text: 'I seldom feel blue.', factor: 'N', reverse: true },
    // Openness (O)
    { id: 'O1', text: 'I have a vivid imagination.', factor: 'O', reverse: false },
    { id: 'O2', text: 'I am not interested in abstract ideas.', factor: 'O', reverse: true },
    { id: 'O3', text: 'I have difficulty understanding abstract ideas.', factor: 'O', reverse: true },
    { id: 'O4', text: 'I have a rich vocabulary.', factor: 'O', reverse: false }
];

// ---------------------------------------------------------------------------
// Step 4b: Cognitive Reflection Test (6 items)
// Items 1-3: Frederick (2005). Items 4-6: Thomson & Oppenheimer (2016).
// ---------------------------------------------------------------------------

var PN_CRT_ITEMS = [
    {
        id: 'CRT1',
        text: 'A bat and a ball cost $1.10 in total. The bat costs $1.00 more than the ball. How much does the ball cost? (in cents)',
        correctAnswer: 5,
        intuitiveAnswer: 10,
        biasType: 'substitution'
    },
    {
        id: 'CRT2',
        text: 'If it takes 5 machines 5 minutes to make 5 widgets, how long would it take 100 machines to make 100 widgets? (in minutes)',
        correctAnswer: 5,
        intuitiveAnswer: 100,
        biasType: 'proportionality'
    },
    {
        id: 'CRT3',
        text: 'In a lake, there is a patch of lily pads. Every day, the patch doubles in size. If it takes 48 days for the patch to cover the entire lake, how long would it take for the patch to cover half of the lake? (in days)',
        correctAnswer: 47,
        intuitiveAnswer: 24,
        biasType: 'exponential'
    },
    {
        id: 'CRT4',
        text: 'If John can drink one barrel of water in 6 days, and Mary can drink one barrel of water in 12 days, how long would it take them to drink one barrel of water together? (in days)',
        correctAnswer: 4,
        intuitiveAnswer: 9,
        biasType: 'rate'
    },
    {
        id: 'CRT5',
        text: 'Jerry received both the 15th highest and the 15th lowest mark in the class. How many students are in the class?',
        correctAnswer: 29,
        intuitiveAnswer: 30,
        biasType: 'boundary'
    },
    {
        id: 'CRT6',
        text: 'A man buys a pig for $60, sells it for $70, buys it back for $80, and sells it again for $90. How much has he made? (in dollars)',
        correctAnswer: 20,
        intuitiveAnswer: 10,
        biasType: 'framing'
    }
];

// ---------------------------------------------------------------------------
// Step 4c: Investment Philosophy (8 items, 5-point agree/disagree)
// ---------------------------------------------------------------------------

var PN_PHILOSOPHY_ITEMS = [
    { id: 'PH1', text: 'I prefer to take a contrarian position against market consensus.', dimension: 'Contrarianism' },
    { id: 'PH2', text: 'I would rather hold a concentrated portfolio of 10 high-conviction names than a diversified portfolio of 40.', dimension: 'Conviction' },
    { id: 'PH3', text: 'Valuation is the most important factor in any investment decision.', dimension: 'Value Orientation' },
    { id: 'PH4', text: 'I rely more on quantitative models than qualitative judgment.', dimension: 'Quantitative Lean' },
    { id: 'PH5', text: 'I am comfortable holding a position through significant drawdowns if my thesis is intact.', dimension: 'Drawdown Tolerance' },
    { id: 'PH6', text: 'I prefer to cut losses quickly rather than wait for thesis confirmation.', dimension: 'Loss Cut Speed' },
    { id: 'PH7', text: 'I actively seek out disconfirming evidence for my positions.', dimension: 'Disconfirmation Seeking' },
    { id: 'PH8', text: 'I prefer to make investment decisions quickly once I have enough information.', dimension: 'Decision Speed' }
];

// ---------------------------------------------------------------------------
// Step 4d: Bias Scenarios (6 items, forced-choice A/B)
// ---------------------------------------------------------------------------

var PN_BIAS_ITEMS = [
    {
        id: 'B1',
        bias: 'disposition_effect',
        biasLabel: 'Disposition Effect',
        scenario: 'You bought a stock at $50. It is now $35 with no change in fundamentals. What do you do?',
        optionA: { text: 'Hold and wait for recovery to my purchase price', score: 'biased' },
        optionB: { text: 'Evaluate the position as if I had no prior cost basis', score: 'debiased' }
    },
    {
        id: 'B2',
        bias: 'anchoring',
        biasLabel: 'Anchoring',
        scenario: 'A broker initiates coverage with a $120 price target. Your own analysis suggests $85. The stock trades at $75. How do you value it?',
        optionA: { text: 'Somewhere between $85 and $120 \u2014 the broker may see something I missed', score: 'biased' },
        optionB: { text: 'At $85 \u2014 my own analysis is what matters; the broker target is irrelevant', score: 'debiased' }
    },
    {
        id: 'B3',
        bias: 'loss_aversion',
        biasLabel: 'Loss Aversion',
        scenario: 'You can choose: (A) A certain gain of $500, or (B) A 50% chance of gaining $1,100 and a 50% chance of gaining nothing. Which do you prefer?',
        optionA: { text: 'The certain $500 gain', score: 'biased' },
        optionB: { text: 'The 50/50 gamble for $1,100', score: 'debiased' }
    },
    {
        id: 'B4',
        bias: 'confirmation_bias',
        biasLabel: 'Confirmation Bias',
        scenario: 'You are bullish on a mining stock. A negative geological report is published. What is your first instinct?',
        optionA: { text: 'Look for reasons the report may be flawed or incomplete', score: 'biased' },
        optionB: { text: 'Treat the report as potentially thesis-destroying and re-evaluate from scratch', score: 'debiased' }
    },
    {
        id: 'B5',
        bias: 'sunk_cost',
        biasLabel: 'Sunk Cost',
        scenario: 'You have spent 6 months and $200K on due diligence for an acquisition target. The final data room reveals a material liability not previously disclosed. What do you do?',
        optionA: { text: 'Proceed but negotiate the price down \u2014 we\'ve come too far to walk away', score: 'biased' },
        optionB: { text: 'Walk away \u2014 the prior investment in due diligence is irrelevant to the go/no-go decision', score: 'debiased' }
    },
    {
        id: 'B6',
        bias: 'overconfidence',
        biasLabel: 'Overconfidence',
        scenario: 'Give a 90% confidence interval for the current price of BHP shares (you should be 90% sure the true price falls within your range).',
        optionA: { text: 'I can give a narrow range (within $5)', score: 'biased' },
        optionB: { text: 'I need a wide range (at least $15-20) to be 90% confident', score: 'debiased' }
    }
];

// ---------------------------------------------------------------------------
// Step 4e: Delivery Preferences (5 items)
// ---------------------------------------------------------------------------

var PN_PREFERENCE_ITEMS = [
    {
        id: 'PR1',
        text: 'When do you want to receive investment analysis?',
        dimension: 'timing',
        options: [
            'Real-time as signals arrive',
            'Morning digest (7am)',
            'Evening summary (6pm)',
            'Weekly batch'
        ]
    },
    {
        id: 'PR2',
        text: 'What level of detail do you prefer in standard deliveries?',
        dimension: 'detail',
        options: [
            'One-liner with verdict',
            'One paragraph summary',
            'Full analysis with data',
            'Deep-dive with appendices'
        ]
    },
    {
        id: 'PR3',
        text: 'Preferred analytical format:',
        dimension: 'format',
        options: [
            'Narrative (flowing text)',
            'Structured (bullet points and tables)',
            'Quantitative (model outputs and charts)',
            'Mixed (narrative with embedded data)'
        ]
    },
    {
        id: 'PR4',
        text: 'How often should the system proactively update you on existing positions?',
        dimension: 'updateFrequency',
        options: [
            'Only when material events occur',
            'Weekly position review',
            'Daily summary',
            'Continuous monitoring'
        ]
    },
    {
        id: 'PR5',
        text: 'When you are under stress or facing losses, I should:',
        dimension: 'stressResponse',
        options: [
            'Give me more data and evidence to ground the decision',
            'Give me a clear recommendation with reasoning',
            'Give me both sides and let me decide',
            'Slow me down with questions before I act'
        ]
    }
];

// ---------------------------------------------------------------------------
// Bias counter-intervention strategies
// ---------------------------------------------------------------------------

var PN_BIAS_INTERVENTIONS = {
    disposition_effect: 'Use clean-sheet evaluation framing ("If you did not already hold this stock, would you buy today at this price?")',
    anchoring: 'Challenge external price anchors; force model-based valuation refresh before referencing broker targets',
    loss_aversion: 'Frame decisions in terms of expected value, not certain outcomes; present asymmetric risk/reward explicitly',
    confirmation_bias: 'Present disconfirming evidence prominently; ask "What would change your mind?" before presenting the bull case',
    sunk_cost: 'Separate prior investment from forward-looking decision; frame as "go/no-go from today with fresh eyes"',
    overconfidence: 'Widen confidence intervals; force pre-commitment to disconfirmation criteria before analysis delivery'
};


// =========================================================================
// STATE
// =========================================================================

var pnState = {
    currentStep: 1,
    maxStepReached: 1,
    firm: {
        name: '',
        type: '',
        aum: '',
        regulations: [],
        governance: ''
    },
    fund: {
        name: '',
        strategy: '',
        geography: '',
        benchmark: '',
        riskBudget: 10,
        holdingPeriod: ''
    },
    portfolio: [],
    portfolioSkipped: false,
    assessment: {
        ipip: {},
        crt: {},
        philosophy: {},
        bias: {},
        preferences: {}
    },
    profile: null,
    chatHistory: [],
    chatTicker: '',
    chatLoading: false,
    assessmentBlock: 0
};


// =========================================================================
// PERSISTENCE (localStorage)
// =========================================================================

var PN_STORAGE_KEY = 'continuum_personalisation_profile';

function pnSaveToLocalStorage() {
    try {
        var data = {
            version: 2,
            savedAt: new Date().toISOString(),
            state: {
                currentStep: pnState.currentStep,
                maxStepReached: pnState.maxStepReached,
                firm: pnState.firm,
                fund: pnState.fund,
                portfolio: pnState.portfolio,
                portfolioSkipped: pnState.portfolioSkipped,
                assessment: pnState.assessment,
                profile: pnState.profile,
                assessmentBlock: pnState.assessmentBlock
            }
        };
        localStorage.setItem(PN_STORAGE_KEY, JSON.stringify(data));
    } catch (e) { /* localStorage unavailable or full */ }
}

function pnLoadFromLocalStorage() {
    try {
        var raw = localStorage.getItem(PN_STORAGE_KEY);
        if (!raw) return false;
        var data = JSON.parse(raw);
        if (!data || data.version !== 2) return false;
        var s = data.state;
        pnState.currentStep = s.currentStep || 1;
        pnState.maxStepReached = s.maxStepReached || 1;
        pnState.firm = s.firm || pnState.firm;
        pnState.fund = s.fund || pnState.fund;
        pnState.portfolio = s.portfolio || [];
        pnState.portfolioSkipped = s.portfolioSkipped || false;
        pnState.assessment = s.assessment || pnState.assessment;
        pnState.profile = s.profile || null;
        pnState.assessmentBlock = s.assessmentBlock || 0;
        return true;
    } catch (e) { return false; }
}

function pnClearLocalStorage() {
    try { localStorage.removeItem(PN_STORAGE_KEY); } catch (e) {}
}


// =========================================================================
// SCORING
// =========================================================================

function pnScoreBigFive() {
    var scores = { E: 0, A: 0, C: 0, N: 0, O: 0 };
    for (var i = 0; i < PN_IPIP_ITEMS.length; i++) {
        var item = PN_IPIP_ITEMS[i];
        var val = pnState.assessment.ipip[item.id];
        if (val === undefined) continue;
        val = parseInt(val, 10);
        if (item.reverse) val = 6 - val;
        scores[item.factor] += val;
    }
    return scores;
}

function pnScoreCRT() {
    var correct = 0;
    var intuitiveErrors = 0;
    var errorTypes = [];
    for (var i = 0; i < PN_CRT_ITEMS.length; i++) {
        var item = PN_CRT_ITEMS[i];
        var answer = parseFloat(pnState.assessment.crt[item.id]);
        if (isNaN(answer)) continue;
        if (answer === item.correctAnswer) {
            correct++;
        } else if (answer === item.intuitiveAnswer) {
            intuitiveErrors++;
            errorTypes.push(item.biasType);
        }
    }
    var label = correct >= 5 ? 'High System 2' :
                correct >= 3 ? 'Moderate System 2' :
                'System 1 Dominant';
    return { score: correct, total: 6, intuitiveErrors: intuitiveErrors, errorTypes: errorTypes, label: label };
}

function pnScorePhilosophy() {
    var scores = {};
    for (var i = 0; i < PN_PHILOSOPHY_ITEMS.length; i++) {
        var item = PN_PHILOSOPHY_ITEMS[i];
        var val = pnState.assessment.philosophy[item.id];
        if (val !== undefined) scores[item.dimension] = parseInt(val, 10);
    }
    return scores;
}

function pnScoreBiases() {
    var biases = [];
    for (var i = 0; i < PN_BIAS_ITEMS.length; i++) {
        var item = PN_BIAS_ITEMS[i];
        var choice = pnState.assessment.bias[item.id];
        if (choice === 'a' && item.optionA.score === 'biased') {
            biases.push({
                bias: item.biasLabel,
                key: item.bias,
                intervention: PN_BIAS_INTERVENTIONS[item.bias] || ''
            });
        }
    }
    return biases;
}

function pnScorePreferences() {
    return {
        timing: pnState.assessment.preferences.PR1 || 'Not specified',
        detail: pnState.assessment.preferences.PR2 || 'Not specified',
        format: pnState.assessment.preferences.PR3 || 'Not specified',
        updateFrequency: pnState.assessment.preferences.PR4 || 'Not specified',
        stressResponse: pnState.assessment.preferences.PR5 || 'Not specified'
    };
}

function pnBuildProfile() {
    return {
        bigFive: pnScoreBigFive(),
        crt: pnScoreCRT(),
        philosophy: pnScorePhilosophy(),
        biases: pnScoreBiases(),
        preferences: pnScorePreferences()
    };
}

function pnPercentileLabel(score, max) {
    var pct = (score / max) * 100;
    if (pct >= 80) return 'High';
    if (pct >= 60) return 'Above Average';
    if (pct >= 40) return 'Average';
    if (pct >= 20) return 'Below Average';
    return 'Low';
}


// =========================================================================
// VALIDATION
// =========================================================================

function pnValidateStep(stepNum) {
    switch (stepNum) {
        case 1:
            return pnState.firm.name.trim() !== '' &&
                   pnState.firm.type !== '' &&
                   pnState.firm.aum !== '' &&
                   pnState.firm.governance !== '';
        case 2:
            return pnState.fund.name.trim() !== '' &&
                   pnState.fund.strategy !== '' &&
                   pnState.fund.geography !== '' &&
                   pnState.fund.benchmark !== '' &&
                   pnState.fund.holdingPeriod !== '';
        case 3:
            return pnState.portfolioSkipped || pnHasPortfolioEntry();
        case 4:
            return pnAssessmentComplete();
        case 5:
            return true;
        default:
            return false;
    }
}

function pnHasPortfolioEntry() {
    for (var i = 0; i < pnState.portfolio.length; i++) {
        if (pnState.portfolio[i].ticker && pnState.portfolio[i].ticker.trim() !== '') return true;
    }
    return false;
}

function pnAssessmentComplete() {
    for (var i = 0; i < PN_IPIP_ITEMS.length; i++) {
        if (pnState.assessment.ipip[PN_IPIP_ITEMS[i].id] === undefined) return false;
    }
    for (var i = 0; i < PN_CRT_ITEMS.length; i++) {
        if (pnState.assessment.crt[PN_CRT_ITEMS[i].id] === undefined ||
            pnState.assessment.crt[PN_CRT_ITEMS[i].id] === '') return false;
    }
    for (var i = 0; i < PN_PHILOSOPHY_ITEMS.length; i++) {
        if (pnState.assessment.philosophy[PN_PHILOSOPHY_ITEMS[i].id] === undefined) return false;
    }
    for (var i = 0; i < PN_BIAS_ITEMS.length; i++) {
        if (!pnState.assessment.bias[PN_BIAS_ITEMS[i].id]) return false;
    }
    for (var i = 0; i < PN_PREFERENCE_ITEMS.length; i++) {
        if (!pnState.assessment.preferences[PN_PREFERENCE_ITEMS[i].id]) return false;
    }
    return true;
}

function pnAssessmentProgress() {
    var total = PN_IPIP_ITEMS.length + PN_CRT_ITEMS.length + PN_PHILOSOPHY_ITEMS.length +
                PN_BIAS_ITEMS.length + PN_PREFERENCE_ITEMS.length;
    var answered = 0;
    var k;
    for (k in pnState.assessment.ipip) {
        if (pnState.assessment.ipip.hasOwnProperty(k)) answered++;
    }
    for (k in pnState.assessment.crt) {
        if (pnState.assessment.crt.hasOwnProperty(k) && pnState.assessment.crt[k] !== '') answered++;
    }
    for (k in pnState.assessment.philosophy) {
        if (pnState.assessment.philosophy.hasOwnProperty(k)) answered++;
    }
    for (k in pnState.assessment.bias) {
        if (pnState.assessment.bias.hasOwnProperty(k)) answered++;
    }
    for (k in pnState.assessment.preferences) {
        if (pnState.assessment.preferences.hasOwnProperty(k)) answered++;
    }
    return { answered: answered, total: total, percent: Math.round((answered / total) * 100) };
}

function pnBlockComplete(blockIndex) {
    var i;
    switch (blockIndex) {
        case 0:
            for (i = 0; i < PN_IPIP_ITEMS.length; i++) {
                if (pnState.assessment.ipip[PN_IPIP_ITEMS[i].id] === undefined) return false;
            }
            return true;
        case 1:
            for (i = 0; i < PN_CRT_ITEMS.length; i++) {
                if (pnState.assessment.crt[PN_CRT_ITEMS[i].id] === undefined ||
                    pnState.assessment.crt[PN_CRT_ITEMS[i].id] === '') return false;
            }
            return true;
        case 2:
            for (i = 0; i < PN_PHILOSOPHY_ITEMS.length; i++) {
                if (pnState.assessment.philosophy[PN_PHILOSOPHY_ITEMS[i].id] === undefined) return false;
            }
            return true;
        case 3:
            for (i = 0; i < PN_BIAS_ITEMS.length; i++) {
                if (!pnState.assessment.bias[PN_BIAS_ITEMS[i].id]) return false;
            }
            return true;
        case 4:
            for (i = 0; i < PN_PREFERENCE_ITEMS.length; i++) {
                if (!pnState.assessment.preferences[PN_PREFERENCE_ITEMS[i].id]) return false;
            }
            return true;
        default:
            return false;
    }
}


// =========================================================================
// SYSTEM PROMPT BUILDER
// =========================================================================

function pnBuildSystemPrompt(profile, firm, fund, portfolio) {
    var p = '';

    p += 'You are a senior equity research analyst at Continuum Intelligence, an independent research platform focused on ASX-listed companies. ';
    p += 'You are providing personalised investment research analysis calibrated to this specific fund manager\'s cognitive profile, institutional context, and decision-making style.\n\n';

    p += '## INSTITUTIONAL CONTEXT\n';
    p += 'Firm: ' + firm.name + ' (' + firm.type + ')\n';
    p += 'AUM: ' + firm.aum + '\n';
    if (firm.regulations && firm.regulations.length > 0) {
        p += 'Regulatory framework: ' + firm.regulations.join(', ') + '\n';
    }
    p += 'Governance: ' + firm.governance + '\n\n';

    p += '## STRATEGY MANDATE\n';
    p += 'Fund: ' + fund.name + '\n';
    p += 'Strategy: ' + fund.strategy + '\n';
    p += 'Geography: ' + fund.geography + '\n';
    p += 'Benchmark: ' + fund.benchmark + '\n';
    p += 'Risk budget: ' + fund.riskBudget + '% tracking error\n';
    p += 'Typical holding period: ' + fund.holdingPeriod + '\n\n';

    if (portfolio && portfolio.length > 0) {
        var validHoldings = portfolio.filter(function(h) { return h.ticker && h.ticker.trim(); });
        if (validHoldings.length > 0) {
            p += '## CURRENT PORTFOLIO\n';
            p += 'The manager currently holds these positions. Reference them when relevant:\n';
            for (var i = 0; i < validHoldings.length; i++) {
                p += '- ' + validHoldings[i].ticker.toUpperCase();
                if (validHoldings[i].weight) p += ': ' + validHoldings[i].weight + '%';
                p += '\n';
            }
            p += '\n';
        }
    }

    p += '## MANAGER COGNITIVE PROFILE\n\n';

    var factors = [
        { key: 'E', label: 'Extraversion' },
        { key: 'A', label: 'Agreeableness' },
        { key: 'C', label: 'Conscientiousness' },
        { key: 'N', label: 'Neuroticism' },
        { key: 'O', label: 'Openness' }
    ];
    p += 'Big Five Personality:\n';
    for (var i = 0; i < factors.length; i++) {
        var f = factors[i];
        var score = profile.bigFive[f.key];
        p += '- ' + f.label + ': ' + score + '/20 (' + pnPercentileLabel(score, 20) + ')\n';
    }
    p += '\n';

    if (profile.bigFive.N >= 14) {
        p += 'HIGH NEUROTICISM: Present risk factors calmly with context. Avoid alarming language. Frame drawdowns as data points, not emergencies.\n';
    } else if (profile.bigFive.N <= 8) {
        p += 'LOW NEUROTICISM: Can handle direct, unfiltered risk warnings. Do not soften negative signals.\n';
    }
    if (profile.bigFive.O >= 14) {
        p += 'HIGH OPENNESS: Can use metaphorical and narrative framing. Open to unconventional analysis angles.\n';
    } else if (profile.bigFive.O <= 8) {
        p += 'LOW OPENNESS: Stick to concrete, structured analysis. Avoid abstract framing. Use data tables and bullet points.\n';
    }
    if (profile.bigFive.C >= 14) {
        p += 'HIGH CONSCIENTIOUSNESS: Provide thorough, well-structured analysis. Include checklists and process steps.\n';
    }
    if (profile.bigFive.E <= 8) {
        p += 'LOW EXTRAVERSION: This manager prefers depth over breadth. Focus analysis rather than broad overviews.\n';
    }
    p += '\n';

    p += 'Cognitive Reflection: ' + profile.crt.score + '/6 (' + profile.crt.label + ')\n';
    if (profile.crt.score >= 5) {
        p += 'HIGH CRT: This manager will rationalise away directive warnings. Use Socratic questioning for bias counter-interventions \u2014 ask questions that expose the bias rather than telling them they are biased.\n';
    } else if (profile.crt.score <= 2) {
        p += 'LOW CRT: Use direct, clear bias warnings rather than subtle Socratic framing. Be explicit about cognitive traps.\n';
    } else {
        p += 'MODERATE CRT: Balance direct warnings with questioning. Use a mix of directive and Socratic approaches.\n';
    }
    p += '\n';

    if (profile.philosophy && Object.keys(profile.philosophy).length > 0) {
        p += 'Investment Philosophy:\n';
        for (var dim in profile.philosophy) {
            if (profile.philosophy.hasOwnProperty(dim)) {
                var val = profile.philosophy[dim];
                var strength = val >= 4 ? 'Strong' : val <= 2 ? 'Weak' : 'Moderate';
                p += '- ' + dim + ': ' + val + '/5 (' + strength + ')\n';
            }
        }
        p += '\n';
    }

    if (profile.biases && profile.biases.length > 0) {
        p += '## BIAS COUNTER-INTERVENTIONS\n';
        p += 'The manager has identified bias vulnerabilities below. When delivering analysis that touches these areas, embed subtle counter-framing:\n';
        for (var b = 0; b < profile.biases.length; b++) {
            p += '- ' + profile.biases[b].bias + ': ' + profile.biases[b].intervention + '\n';
        }
        p += '\n';
    }

    p += '## DELIVERY CALIBRATION\n';
    p += 'Timing preference: ' + profile.preferences.timing + '\n';
    p += 'Detail preference: ' + profile.preferences.detail + '\n';
    p += 'Format preference: ' + profile.preferences.format + '\n';
    p += 'Update frequency: ' + profile.preferences.updateFrequency + '\n';
    p += 'Under stress: ' + profile.preferences.stressResponse + '\n\n';

    p += '## VOICE & STYLE\n';
    p += 'Speak as "we" (Continuum Intelligence). Never say "I". Be direct and opinionated.\n';
    p += 'Reference specific evidence from the research passages. Take positions.\n';
    p += 'Use the vocabulary of an institutional investor: "the print", "the tape", "the multiple", "re-rate", "de-rate", "the street", "consensus".\n';
    p += 'Never use markdown headers (## or ###). Write in flowing paragraphs.\n';
    p += 'Never begin a response with "Based on" or "Here is" or "Sure". Get straight to the analysis.\n';
    p += 'When presenting numbers, weave them into sentences naturally.\n';
    p += 'Ground every claim in the provided research passages. Cite specific evidence.\n';
    p += 'Never fabricate data, price targets, or financial metrics not in the provided research.\n';

    return p;
}


// =========================================================================
// FORM COMPONENT HELPERS
// =========================================================================

function pnTextInput(id, label, value, placeholder, required) {
    var req = required !== false;
    return '<div class="pn-form-group">' +
        '<label class="pn-label" for="pn-' + id + '">' + label + (req ? ' <span class="pn-required">*</span>' : '') + '</label>' +
        '<input type="text" class="pn-input" id="pn-' + id + '" data-field="' + id + '" ' +
            'value="' + escapeAttr(value || '') + '" ' +
            'placeholder="' + escapeAttr(placeholder || '') + '">' +
    '</div>';
}

function pnSelect(id, label, options, selectedValue, required) {
    var req = required !== false;
    var html = '<div class="pn-form-group">' +
        '<label class="pn-label" for="pn-' + id + '">' + label + (req ? ' <span class="pn-required">*</span>' : '') + '</label>' +
        '<select class="pn-select" id="pn-' + id + '" data-field="' + id + '">' +
        '<option value="">Select...</option>';
    for (var i = 0; i < options.length; i++) {
        var sel = options[i] === selectedValue ? ' selected' : '';
        html += '<option value="' + escapeAttr(options[i]) + '"' + sel + '>' + escapeHtml(options[i]) + '</option>';
    }
    html += '</select></div>';
    return html;
}

function pnMultiSelect(id, label, options, selectedValues) {
    var html = '<div class="pn-form-group full-width">' +
        '<label class="pn-label">' + label + '</label>' +
        '<div class="pn-multi-select" id="pn-' + id + '">';
    for (var i = 0; i < options.length; i++) {
        var checked = selectedValues && selectedValues.indexOf(options[i]) !== -1;
        var cls = 'pn-checkbox-label' + (checked ? ' checked' : '');
        html += '<label class="' + cls + '">' +
            '<input type="checkbox" value="' + escapeAttr(options[i]) + '"' + (checked ? ' checked' : '') + '>' +
            '<span class="pn-checkbox-indicator"></span>' +
            escapeHtml(options[i]) +
        '</label>';
    }
    html += '</div></div>';
    return html;
}

function pnSlider(id, label, min, max, value, unit, required) {
    var req = required !== false;
    return '<div class="pn-form-group full-width">' +
        '<label class="pn-label">' + label + (req ? ' <span class="pn-required">*</span>' : '') + '</label>' +
        '<div class="pn-slider-container">' +
            '<div class="pn-slider-row">' +
                '<input type="range" class="pn-slider" id="pn-' + id + '" data-field="' + id + '" ' +
                    'min="' + min + '" max="' + max + '" value="' + value + '" step="1">' +
                '<span class="pn-slider-value" id="pn-' + id + '-value">' + value + (unit || '') + '</span>' +
            '</div>' +
            '<div class="pn-slider-labels">' +
                '<span>' + min + (unit || '') + '</span>' +
                '<span>' + max + (unit || '') + '</span>' +
            '</div>' +
        '</div>' +
    '</div>';
}


// =========================================================================
// RENDER FUNCTIONS
// =========================================================================

function renderPage() {
    return '<div class="pn-wizard" id="pn-wizard">' +
        renderStepIndicator() +
        '<div class="pn-wizard-body" id="pn-wizard-body">' +
            renderCurrentStep() +
        '</div>' +
        renderWizardFooter() +
    '</div>';
}

function renderStepIndicator() {
    var html = '<div class="pn-step-indicator">';
    for (var i = 0; i < PN_STEP_LABELS.length; i++) {
        var s = PN_STEP_LABELS[i];
        var cls = 'pn-step-dot';
        if (s.num === pnState.currentStep) cls += ' active';
        if (s.num < pnState.currentStep) cls += ' completed';
        if (s.num <= pnState.maxStepReached) cls += ' reachable';
        html += '<div class="' + cls + '" data-step="' + s.num + '">';
        html += '<div class="pn-step-num"><span class="pn-step-num-text">' + s.num + '</span></div>';
        html += '<div class="pn-step-title">' + s.title + '</div>';
        html += '<div class="pn-step-subtitle">' + s.subtitle + '</div>';
        html += '</div>';
        if (i < PN_STEP_LABELS.length - 1) {
            var lineClass = 'pn-step-line' + (s.num < pnState.currentStep ? ' completed' : '');
            html += '<div class="' + lineClass + '"></div>';
        }
    }
    html += '</div>';
    return html;
}

function renderCurrentStep() {
    switch (pnState.currentStep) {
        case 1: return renderStep1();
        case 2: return renderStep2();
        case 3: return renderStep3();
        case 4: return renderStep4();
        case 5: return renderStep5();
        default: return '';
    }
}

function renderStep1() {
    return '<div class="pn-step" data-step="1">' +
        '<div class="pn-step-header">' +
            '<h2 class="pn-step-heading">Firm Configuration</h2>' +
            '<p class="pn-step-desc">Tell us about your institutional context. This determines how signals are filtered and compliance requirements are applied.</p>' +
        '</div>' +
        '<div class="pn-form-grid">' +
            pnTextInput('firm-name', 'Firm Name', pnState.firm.name, 'e.g. Magellan Financial Group') +
            pnSelect('firm-type', 'Firm Type', PN_FIRM_OPTIONS.type, pnState.firm.type) +
            pnSelect('firm-aum', 'AUM Range', PN_FIRM_OPTIONS.aum, pnState.firm.aum) +
            pnSelect('firm-governance', 'Investment Governance', PN_FIRM_OPTIONS.governance, pnState.firm.governance) +
            pnMultiSelect('firm-regs', 'Regulatory Framework (optional)', PN_FIRM_OPTIONS.regulations, pnState.firm.regulations) +
        '</div>' +
    '</div>';
}

function renderStep2() {
    return '<div class="pn-step" data-step="2">' +
        '<div class="pn-step-header">' +
            '<h2 class="pn-step-heading">Fund & Strategy</h2>' +
            '<p class="pn-step-desc">Define your fund mandate. This calibrates which signals are relevant and how analysis is framed for your strategy.</p>' +
        '</div>' +
        '<div class="pn-form-grid">' +
            pnTextInput('fund-name', 'Fund Name', pnState.fund.name, 'e.g. Magellan Global Fund') +
            pnSelect('fund-strategy', 'Strategy Type', PN_FUND_OPTIONS.strategy, pnState.fund.strategy) +
            pnSelect('fund-geography', 'Geography', PN_FUND_OPTIONS.geography, pnState.fund.geography) +
            pnSelect('fund-benchmark', 'Benchmark', PN_FUND_OPTIONS.benchmark, pnState.fund.benchmark) +
            pnSelect('fund-holding', 'Typical Holding Period', PN_FUND_OPTIONS.holdingPeriod, pnState.fund.holdingPeriod) +
            pnSlider('fund-risk', 'Risk Budget (Tracking Error)', 2, 25, pnState.fund.riskBudget, '%') +
        '</div>' +
    '</div>';
}

function renderStep3() {
    var holdingsHtml = '';
    for (var i = 0; i < 5; i++) {
        var h = pnState.portfolio[i] || { ticker: '', weight: '' };
        holdingsHtml += '<div class="pn-portfolio-row">' +
            '<input type="text" class="pn-input pn-ticker-input" data-index="' + i + '" ' +
                'value="' + escapeAttr(h.ticker || '') + '" placeholder="e.g. BHP" ' +
                'list="pn-ticker-list" autocomplete="off">' +
            '<input type="number" class="pn-input pn-weight-input" data-index="' + i + '" ' +
                'value="' + (h.weight || '') + '" placeholder="%" min="0" max="100" step="0.5">' +
        '</div>';
    }

    var datalistHtml = '<datalist id="pn-ticker-list">';
    var tickers = (typeof STOCK_DATA !== 'undefined') ? Object.keys(STOCK_DATA).sort() : [];
    for (var i = 0; i < tickers.length; i++) {
        datalistHtml += '<option value="' + tickers[i] + '">';
    }
    datalistHtml += '</datalist>';

    return '<div class="pn-step" data-step="3">' +
        '<div class="pn-step-header">' +
            '<h2 class="pn-step-heading">Portfolio Holdings</h2>' +
            '<p class="pn-step-desc">Enter up to 5 current holdings so the AI can reference your positions in conversation. This step is optional.</p>' +
        '</div>' +
        datalistHtml +
        '<div class="pn-portfolio-grid">' +
            '<div class="pn-portfolio-header"><span>Ticker</span><span>Weight %</span></div>' +
            holdingsHtml +
        '</div>' +
        '<button class="pn-skip-btn" id="pn-skip-portfolio">Skip \u2014 use representative portfolio</button>' +
    '</div>';
}

function renderStep4() {
    var progress = pnAssessmentProgress();
    var blockNames = [
        { title: 'Personality', items: PN_IPIP_ITEMS.length },
        { title: 'Cognitive', items: PN_CRT_ITEMS.length },
        { title: 'Philosophy', items: PN_PHILOSOPHY_ITEMS.length },
        { title: 'Bias', items: PN_BIAS_ITEMS.length },
        { title: 'Preferences', items: PN_PREFERENCE_ITEMS.length }
    ];

    var blockNav = '<div class="pn-assessment-nav">';
    for (var i = 0; i < blockNames.length; i++) {
        var cls = 'pn-assessment-nav-item';
        if (i === pnState.assessmentBlock) cls += ' active';
        if (pnBlockComplete(i)) cls += ' complete';
        blockNav += '<button class="' + cls + '" data-block="' + i + '">' +
            '<span class="pn-assessment-nav-num">' + (i + 1) + '</span> ' +
            blockNames[i].title + ' <span style="opacity:0.5;font-size:0.68rem">(' + blockNames[i].items + ')</span>' +
        '</button>';
    }
    blockNav += '</div>';

    var contentHtml = '';
    switch (pnState.assessmentBlock) {
        case 0: contentHtml = renderIPIPBlock(); break;
        case 1: contentHtml = renderCRTBlock(); break;
        case 2: contentHtml = renderPhilosophyBlock(); break;
        case 3: contentHtml = renderBiasBlock(); break;
        case 4: contentHtml = renderPreferencesBlock(); break;
    }

    return '<div class="pn-step" data-step="4">' +
        '<div class="pn-step-header">' +
            '<h2 class="pn-step-heading">Cognitive & Behavioural Assessment</h2>' +
            '<p class="pn-step-desc">This takes approximately 15 minutes. Complete all sections to build your profile.</p>' +
            '<p class="pn-step-desc-privacy">All scoring happens locally in your browser. Nothing is sent to any server.</p>' +
        '</div>' +
        '<div class="pn-progress-bar">' +
            '<div class="pn-progress-fill" style="width: ' + progress.percent + '%;"></div>' +
            '<span class="pn-progress-text">' + progress.answered + ' / ' + progress.total + ' completed</span>' +
        '</div>' +
        blockNav +
        '<div class="pn-assessment-content" id="pn-assessment-content">' +
            contentHtml +
        '</div>' +
    '</div>';
}

function renderIPIPBlock() {
    var html = '<div class="pn-assessment-block">' +
        '<div class="pn-assessment-block-title">Mini-IPIP Big Five Personality Assessment</div>' +
        '<div class="pn-assessment-block-desc">Rate how accurately each statement describes you in general. There are no right or wrong answers.</div>';
    for (var i = 0; i < PN_IPIP_ITEMS.length; i++) {
        html += renderLikertItem(PN_IPIP_ITEMS[i], pnState.assessment.ipip[PN_IPIP_ITEMS[i].id], 'ipip');
    }
    html += '</div>';
    return html;
}

function renderCRTBlock() {
    var html = '<div class="pn-assessment-block">' +
        '<div class="pn-assessment-block-title">Cognitive Reflection Test</div>' +
        '<div class="pn-assessment-block-desc">Answer each question with a number. Take your time \u2014 your first instinct may not be correct.</div>';
    for (var i = 0; i < PN_CRT_ITEMS.length; i++) {
        var item = PN_CRT_ITEMS[i];
        var val = pnState.assessment.crt[item.id];
        html += '<div class="pn-crt-item">' +
            '<div class="pn-crt-text">' + (i + 1) + '. ' + escapeHtml(item.text) + '</div>' +
            '<input type="number" class="pn-crt-input" data-id="' + item.id + '" ' +
                'value="' + (val !== undefined ? val : '') + '" placeholder="Your answer">' +
        '</div>';
    }
    html += '</div>';
    return html;
}

function renderPhilosophyBlock() {
    var html = '<div class="pn-assessment-block">' +
        '<div class="pn-assessment-block-title">Investment Philosophy</div>' +
        '<div class="pn-assessment-block-desc">Rate your agreement with each statement. 1 = Strongly Disagree, 5 = Strongly Agree.</div>';
    for (var i = 0; i < PN_PHILOSOPHY_ITEMS.length; i++) {
        html += renderLikertItem(PN_PHILOSOPHY_ITEMS[i], pnState.assessment.philosophy[PN_PHILOSOPHY_ITEMS[i].id], 'philosophy');
    }
    html += '</div>';
    return html;
}

function renderBiasBlock() {
    var html = '<div class="pn-assessment-block">' +
        '<div class="pn-assessment-block-title">Bias Scenario Assessment</div>' +
        '<div class="pn-assessment-block-desc">For each scenario, choose the response that best describes what you would actually do (not what you think you should do).</div>';
    for (var i = 0; i < PN_BIAS_ITEMS.length; i++) {
        html += renderForcedChoice(PN_BIAS_ITEMS[i], pnState.assessment.bias[PN_BIAS_ITEMS[i].id]);
    }
    html += '</div>';
    return html;
}

function renderPreferencesBlock() {
    var html = '<div class="pn-assessment-block">' +
        '<div class="pn-assessment-block-title">Delivery Preferences</div>' +
        '<div class="pn-assessment-block-desc">Tell us how you want to receive investment analysis.</div>';
    for (var i = 0; i < PN_PREFERENCE_ITEMS.length; i++) {
        var item = PN_PREFERENCE_ITEMS[i];
        var selectedVal = pnState.assessment.preferences[item.id] || '';
        html += '<div class="pn-pref-item">' +
            '<div class="pn-pref-text">' + escapeHtml(item.text) + '</div>' +
            '<select class="pn-select pn-pref-select" data-id="' + item.id + '">' +
                '<option value="">Select...</option>';
        for (var j = 0; j < item.options.length; j++) {
            var sel = item.options[j] === selectedVal ? ' selected' : '';
            html += '<option value="' + escapeAttr(item.options[j]) + '"' + sel + '>' + escapeHtml(item.options[j]) + '</option>';
        }
        html += '</select></div>';
    }
    html += '</div>';
    return html;
}

function renderLikertItem(item, currentValue, category) {
    var labels = ['Very Inaccurate', 'Inaccurate', 'Neutral', 'Accurate', 'Very Accurate'];
    if (category === 'philosophy') {
        labels = ['Strongly Disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly Agree'];
    }
    var html = '<div class="pn-likert-item">' +
        '<div class="pn-likert-text">' + escapeHtml(item.text) + '</div>' +
        '<div class="pn-likert-scale">';
    for (var i = 1; i <= 5; i++) {
        var selected = (parseInt(currentValue, 10) === i) ? ' selected' : '';
        html += '<button class="pn-likert-btn' + selected + '" data-id="' + item.id + '" data-value="' + i + '" data-category="' + category + '" title="' + labels[i - 1] + '">' +
            '<span class="pn-likert-circle"></span>' +
            '<span class="pn-likert-label">' + labels[i - 1] + '</span>' +
        '</button>';
    }
    html += '</div></div>';
    return html;
}

function renderForcedChoice(item, currentValue) {
    return '<div class="pn-bias-scenario">' +
        '<div class="pn-bias-text">' + escapeHtml(item.scenario) + '</div>' +
        '<div class="pn-bias-options">' +
            '<button class="pn-bias-option' + (currentValue === 'a' ? ' selected' : '') + '" data-id="' + item.id + '" data-value="a">' +
                '<span class="pn-bias-label">A</span> ' + escapeHtml(item.optionA.text) +
            '</button>' +
            '<button class="pn-bias-option' + (currentValue === 'b' ? ' selected' : '') + '" data-id="' + item.id + '" data-value="b">' +
                '<span class="pn-bias-label">B</span> ' + escapeHtml(item.optionB.text) +
            '</button>' +
        '</div>' +
    '</div>';
}

function renderStep5() {
    if (!pnState.profile) {
        pnState.profile = pnBuildProfile();
        pnSaveToLocalStorage();
    }

    return '<div class="pn-step pn-step-chat" data-step="5">' +
        '<div class="pn-step-header">' +
            '<h2 class="pn-step-heading">Calibrated Research Chat</h2>' +
            '<p class="pn-step-desc">Your cognitive profile is now active. Ask research questions and see how analysis is calibrated to your decision-making style.</p>' +
        '</div>' +
        '<div class="pn-chat-layout">' +
            renderProfileSidebar() +
            '<div class="pn-chat-main">' +
                renderChatHeader() +
                '<div class="pn-chat-messages" id="pn-chat-messages"></div>' +
                '<div class="pn-chat-input-area">' +
                    '<textarea class="pn-chat-input" id="pn-chat-input" placeholder="Ask about a stock..." rows="1"></textarea>' +
                    '<button class="pn-chat-send" id="pn-chat-send" disabled>' +
                        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>' +
                    '</button>' +
                '</div>' +
            '</div>' +
        '</div>' +
    '</div>';
}

function renderChatHeader() {
    var tickers = (typeof STOCK_DATA !== 'undefined') ? Object.keys(STOCK_DATA).sort() : [];
    var tickerOptions = '';
    for (var i = 0; i < tickers.length; i++) {
        var sel = tickers[i] === pnState.chatTicker ? ' selected' : '';
        var company = '';
        if (typeof STOCK_DATA !== 'undefined' && STOCK_DATA[tickers[i]]) {
            company = STOCK_DATA[tickers[i]].company || tickers[i];
        }
        tickerOptions += '<option value="' + tickers[i] + '"' + sel + '>' + tickers[i] + (company ? ' \u2014 ' + company : '') + '</option>';
    }

    return '<div class="pn-chat-header">' +
        '<h3>Research Chat</h3>' +
        '<select class="pn-chat-ticker-select" id="pn-chat-ticker">' +
            '<option value="">Select stock...</option>' +
            tickerOptions +
        '</select>' +
    '</div>';
}

function renderProfileSidebar() {
    if (!pnState.profile) {
        return '<div class="pn-chat-sidebar"><div class="pn-profile-empty">Complete the assessment to see your profile.</div></div>';
    }
    var p = pnState.profile;

    var bigFiveHtml = '';
    var factors = [
        { key: 'E', label: 'Extraversion' },
        { key: 'A', label: 'Agreeableness' },
        { key: 'C', label: 'Conscientiousness' },
        { key: 'N', label: 'Neuroticism' },
        { key: 'O', label: 'Openness' }
    ];
    for (var i = 0; i < factors.length; i++) {
        var f = factors[i];
        var score = p.bigFive[f.key];
        var pct = Math.round((score / 20) * 100);
        bigFiveHtml += '<div class="pn-profile-factor">' +
            '<div class="pn-profile-factor-label">' + f.label + '</div>' +
            '<div class="pn-profile-bar"><div class="pn-profile-bar-fill" style="width: ' + pct + '%;"></div></div>' +
            '<div class="pn-profile-factor-score">' + score + '/20</div>' +
        '</div>';
    }

    var crtHtml = '<div class="pn-profile-crt">' + p.crt.score + '/6</div>' +
        '<div class="pn-profile-crt-label">' + p.crt.label + '</div>';

    var biasHtml = '';
    if (p.biases.length === 0) {
        biasHtml = '<div class="pn-profile-note">No significant bias vulnerabilities identified.</div>';
    } else {
        for (var i = 0; i < p.biases.length; i++) {
            biasHtml += '<span class="pn-trait pn-trait-bias">' + escapeHtml(p.biases[i].bias) + '</span> ';
        }
    }

    var contextHtml = '';
    if (pnState.firm.name) {
        contextHtml = '<div class="pn-profile-firm">' +
            escapeHtml(pnState.firm.name) + '<br>' +
            '<span style="opacity:0.7">' + escapeHtml(pnState.fund.name || '') + '</span>' +
        '</div>';
    }

    return '<div class="pn-chat-sidebar">' +
        '<div class="pn-profile-summary">' +
            '<div class="pn-profile-summary-title">Your Profile</div>' +
            contextHtml +
            '<div class="pn-profile-section">' +
                '<div class="pn-profile-section-label">Big Five</div>' +
                bigFiveHtml +
            '</div>' +
            '<div class="pn-profile-section">' +
                '<div class="pn-profile-section-label">Cognitive Style</div>' +
                crtHtml +
            '</div>' +
            '<div class="pn-profile-section">' +
                '<div class="pn-profile-section-label">Bias Vulnerabilities</div>' +
                '<div class="pn-profile-biases">' + biasHtml + '</div>' +
            '</div>' +
            '<button class="pn-reset-btn" id="pn-reset-profile">Reset Profile</button>' +
        '</div>' +
    '</div>';
}

function renderWizardFooter() {
    var isFirst = pnState.currentStep === 1;
    var isLast = pnState.currentStep === 5;
    var canAdvance = pnValidateStep(pnState.currentStep);

    var nextLabel = 'Continue';
    if (pnState.currentStep === 4) nextLabel = 'Build Profile & Chat';

    return '<div class="pn-wizard-footer">' +
        '<button class="pn-btn pn-btn-secondary" id="pn-prev"' + (isFirst ? ' style="visibility:hidden"' : '') + '>' +
            '\u2190 Back' +
        '</button>' +
        '<div class="pn-wizard-footer-center">' +
            '<span class="pn-step-counter">Step ' + pnState.currentStep + ' of 5</span>' +
        '</div>' +
        (isLast ? '<div></div>' :
            '<button class="pn-btn pn-btn-primary" id="pn-next"' + (canAdvance ? '' : ' disabled') + '>' +
                nextLabel + ' \u2192' +
            '</button>'
        ) +
    '</div>';
}


// =========================================================================
// CHAT LOGIC
// =========================================================================

function renderChatMessages() {
    var el = document.getElementById('pn-chat-messages');
    if (!el) return;

    if (pnState.chatHistory.length === 0) {
        el.innerHTML = '<div class="pn-chat-welcome">' +
            '<div class="pn-chat-welcome-title">Your calibrated analyst is ready</div>' +
            '<div class="pn-chat-welcome-text">Select a stock above and ask any research question. ' +
                'The AI will deliver analysis calibrated to your cognitive profile, biases, and preferences.</div>' +
        '</div>';
        return;
    }

    var html = '';
    for (var i = 0; i < pnState.chatHistory.length; i++) {
        var msg = pnState.chatHistory[i];
        var cls = 'pn-chat-msg ' + msg.role;
        var content = msg.role === 'assistant' ? formatMarkdown(msg.content) : escapeHtml(msg.content);
        html += '<div class="' + cls + '">' + content + '</div>';
    }
    el.innerHTML = html;
    el.scrollTop = el.scrollHeight;
}

function showChatTyping() {
    var el = document.getElementById('pn-chat-messages');
    if (!el) return;
    var typing = document.createElement('div');
    typing.className = 'pn-chat-typing';
    typing.id = 'pn-chat-typing';
    typing.innerHTML = '<span class="pn-chat-typing-dot"></span><span class="pn-chat-typing-dot"></span><span class="pn-chat-typing-dot"></span>';
    el.appendChild(typing);
    el.scrollTop = el.scrollHeight;
}

function hideChatTyping() {
    var typing = document.getElementById('pn-chat-typing');
    if (typing) typing.remove();
}

function appendChatError(message) {
    var el = document.getElementById('pn-chat-messages');
    if (!el) return;
    var err = document.createElement('div');
    err.className = 'pn-chat-msg error';
    err.textContent = message;
    el.appendChild(err);
    el.scrollTop = el.scrollHeight;
}

function pnSendChat() {
    var input = document.getElementById('pn-chat-input');
    var sendBtn = document.getElementById('pn-chat-send');
    if (!input || pnState.chatLoading) return;

    var question = input.value.trim();
    if (!question || !pnState.chatTicker) return;

    pnState.chatHistory.push({ role: 'user', content: question });
    input.value = '';
    input.style.height = 'auto';
    if (sendBtn) sendBtn.disabled = true;
    pnState.chatLoading = true;

    renderChatMessages();
    showChatTyping();

    var systemPrompt = pnBuildSystemPrompt(
        pnState.profile,
        pnState.firm,
        pnState.fund,
        pnState.portfolioSkipped ? [] : pnState.portfolio
    );

    var history = [];
    for (var i = 0; i < pnState.chatHistory.length - 1; i++) {
        history.push({
            role: pnState.chatHistory[i].role,
            content: pnState.chatHistory[i].content
        });
    }

    var PRODUCTION_API = 'https://imaginative-vision-production-16cb.up.railway.app';
    var isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    var apiOrigin = window.CHAT_API_URL ||
        (isLovar PRODUCTION_API = 'https://imaginative-vision-production-16cb.up.railway.app';cal ? 'http://localhost:8000' : PRODUCTION_API);

    fetch(apiOrigin + '/api/research-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            ticker: pnState.chatTicker,
            question: question,
            conversation_history: history,
            custom_system_prompt: systemPrompt
        })
    })
    .then(function(res) {
        if (!res.ok) throw new Error('Request failed (' + res.status + ')');
        return res.json();
    })
    .then(function(data) {
        hideChatTyping();
        pnState.chatLoading = false;
        pnState.chatHistory.push({ role: 'assistant', content: data.response });
        renderChatMessages();
        if (sendBtn) sendBtn.disabled = false;
    })
    .catch(function(err) {
        hideChatTyping();
        pnState.chatLoading = false;
        appendChatError(err.message || 'Something went wrong. Please try again.');
        if (sendBtn) sendBtn.disabled = false;
    });
}


// =========================================================================
// EVENT BINDING
// =========================================================================

function bindAll() {
    bindStepIndicator();
    bindNavigation();
    bindCurrentStepInputs();
}

function bindStepIndicator() {
    var dots = document.querySelectorAll('.pn-step-dot.reachable');
    for (var i = 0; i < dots.length; i++) {
        dots[i].addEventListener('click', function() {
            var step = parseInt(this.getAttribute('data-step'), 10);
            if (step <= pnState.maxStepReached && step !== pnState.currentStep) {
                pnState.currentStep = step;
                pnRefresh();
            }
        });
    }
}

function bindNavigation() {
    var nextBtn = document.getElementById('pn-next');
    var prevBtn = document.getElementById('pn-prev');

    if (nextBtn) {
        nextBtn.addEventListener('click', function() {
            if (!pnValidateStep(pnState.currentStep)) return;
            if (pnState.currentStep === 4) {
                pnState.profile = pnBuildProfile();
            }
            pnState.currentStep++;
            if (pnState.currentStep > pnState.maxStepReached) {
                pnState.maxStepReached = pnState.currentStep;
            }
            pnSaveToLocalStorage();
            pnRefresh();
        });
    }

    if (prevBtn) {
        prevBtn.addEventListener('click', function() {
            if (pnState.currentStep > 1) {
                pnState.currentStep--;
                pnSaveToLocalStorage();
                pnRefresh();
            }
        });
    }
}

function bindCurrentStepInputs() {
    switch (pnState.currentStep) {
        case 1: bindStep1Inputs(); break;
        case 2: bindStep2Inputs(); break;
        case 3: bindStep3Inputs(); break;
        case 4: bindStep4Inputs(); break;
        case 5: bindStep5Inputs(); break;
    }
}

function bindStep1Inputs() {
    bindTextInput('pn-firm-name', function(val) { pnState.firm.name = val; });
    bindSelectInput('pn-firm-type', function(val) { pnState.firm.type = val; });
    bindSelectInput('pn-firm-aum', function(val) { pnState.firm.aum = val; });
    bindSelectInput('pn-firm-governance', function(val) { pnState.firm.governance = val; });

    var container = document.getElementById('pn-firm-regs');
    if (container) {
        var labels = container.querySelectorAll('.pn-checkbox-label');
        for (var i = 0; i < labels.length; i++) {
            labels[i].addEventListener('click', function(e) {
                e.preventDefault();
                var cb = this.querySelector('input[type="checkbox"]');
                cb.checked = !cb.checked;
                this.classList.toggle('checked', cb.checked);
                pnState.firm.regulations = [];
                var allCbs = container.querySelectorAll('input[type="checkbox"]:checked');
                for (var j = 0; j < allCbs.length; j++) {
                    pnState.firm.regulations.push(allCbs[j].value);
                }
                pnSaveToLocalStorage();
                updateNextButton();
            });
        }
    }
}

function bindStep2Inputs() {
    bindTextInput('pn-fund-name', function(val) { pnState.fund.name = val; });
    bindSelectInput('pn-fund-strategy', function(val) { pnState.fund.strategy = val; });
    bindSelectInput('pn-fund-geography', function(val) { pnState.fund.geography = val; });
    bindSelectInput('pn-fund-benchmark', function(val) { pnState.fund.benchmark = val; });
    bindSelectInput('pn-fund-holding', function(val) { pnState.fund.holdingPeriod = val; });

    var slider = document.getElementById('pn-fund-risk');
    var sliderVal = document.getElementById('pn-fund-risk-value');
    if (slider) {
        slider.addEventListener('input', function() {
            pnState.fund.riskBudget = parseInt(this.value, 10);
            if (sliderVal) sliderVal.textContent = this.value + '%';
            pnSaveToLocalStorage();
        });
    }
}

function bindStep3Inputs() {
    var tickerInputs = document.querySelectorAll('.pn-ticker-input');
    for (var i = 0; i < tickerInputs.length; i++) {
        tickerInputs[i].addEventListener('input', function() {
            var idx = parseInt(this.getAttribute('data-index'), 10);
            if (!pnState.portfolio[idx]) pnState.portfolio[idx] = { ticker: '', weight: '' };
            pnState.portfolio[idx].ticker = this.value.toUpperCase();
            pnState.portfolioSkipped = false;
            pnSaveToLocalStorage();
            updateNextButton();
        });
    }

    var weightInputs = document.querySelectorAll('.pn-weight-input');
    for (var i = 0; i < weightInputs.length; i++) {
        weightInputs[i].addEventListener('input', function() {
            var idx = parseInt(this.getAttribute('data-index'), 10);
            if (!pnState.portfolio[idx]) pnState.portfolio[idx] = { ticker: '', weight: '' };
            pnState.portfolio[idx].weight = this.value;
            pnSaveToLocalStorage();
        });
    }

    var skipBtn = document.getElementById('pn-skip-portfolio');
    if (skipBtn) {
        skipBtn.addEventListener('click', function() {
            pnState.portfolioSkipped = true;
            pnSaveToLocalStorage();
            updateNextButton();
        });
    }
}

function bindStep4Inputs() {
    var navItems = document.querySelectorAll('.pn-assessment-nav-item');
    for (var i = 0; i < navItems.length; i++) {
        navItems[i].addEventListener('click', function() {
            var block = parseInt(this.getAttribute('data-block'), 10);
            if (block !== pnState.assessmentBlock) {
                pnState.assessmentBlock = block;
                pnSaveToLocalStorage();
                pnRefreshAssessment();
            }
        });
    }
    bindAssessmentBlockInputs();
}

function bindAssessmentBlockInputs() {
    switch (pnState.assessmentBlock) {
        case 0: bindLikertInputs('ipip'); break;
        case 1: bindCRTInputs(); break;
        case 2: bindLikertInputs('philosophy'); break;
        case 3: bindBiasInputs(); break;
        case 4: bindPreferenceInputs(); break;
    }
}

function bindLikertInputs(category) {
    var btns = document.querySelectorAll('.pn-likert-btn[data-category="' + category + '"]');
    for (var i = 0; i < btns.length; i++) {
        btns[i].addEventListener('click', function() {
            var id = this.getAttribute('data-id');
            var val = parseInt(this.getAttribute('data-value'), 10);
            pnState.assessment[category][id] = val;
            var siblings = this.parentNode.querySelectorAll('.pn-likert-btn');
            for (var j = 0; j < siblings.length; j++) {
                siblings[j].classList.remove('selected');
            }
            this.classList.add('selected');
            pnSaveToLocalStorage();
            updateProgress();
            updateNextButton();
        });
    }
}

function bindCRTInputs() {
    var inputs = document.querySelectorAll('.pn-crt-input');
    for (var i = 0; i < inputs.length; i++) {
        inputs[i].addEventListener('input', function() {
            var id = this.getAttribute('data-id');
            pnState.assessment.crt[id] = this.value;
            pnSaveToLocalStorage();
            updateProgress();
            updateNextButton();
        });
    }
}

function bindBiasInputs() {
    var btns = document.querySelectorAll('.pn-bias-option');
    for (var i = 0; i < btns.length; i++) {
        btns[i].addEventListener('click', function() {
            var id = this.getAttribute('data-id');
            var val = this.getAttribute('data-value');
            pnState.assessment.bias[id] = val;
            var siblings = this.parentNode.querySelectorAll('.pn-bias-option');
            for (var j = 0; j < siblings.length; j++) {
                siblings[j].classList.remove('selected');
            }
            this.classList.add('selected');
            pnSaveToLocalStorage();
            updateProgress();
            updateNextButton();
        });
    }
}

function bindPreferenceInputs() {
    var selects = document.querySelectorAll('.pn-pref-select');
    for (var i = 0; i < selects.length; i++) {
        selects[i].addEventListener('change', function() {
            var id = this.getAttribute('data-id');
            pnState.assessment.preferences[id] = this.value;
            pnSaveToLocalStorage();
            updateProgress();
            updateNextButton();
        });
    }
}

function bindStep5Inputs() {
    var input = document.getElementById('pn-chat-input');
    var sendBtn = document.getElementById('pn-chat-send');
    var tickerSelect = document.getElementById('pn-chat-ticker');
    var resetBtn = document.getElementById('pn-reset-profile');

    if (!pnState.chatTicker && tickerSelect && tickerSelect.value) {
        pnState.chatTicker = tickerSelect.value;
    }

    renderChatMessages();

    if (input) {
        input.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 100) + 'px';
            if (sendBtn) sendBtn.disabled = !this.value.trim() || !pnState.chatTicker;
        });
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                pnSendChat();
            }
        });
    }

    if (sendBtn) {
        sendBtn.addEventListener('click', function() {
            pnSendChat();
        });
    }

    if (tickerSelect) {
        tickerSelect.addEventListener('change', function() {
            pnState.chatTicker = this.value;
            pnState.chatHistory = [];
            renderChatMessages();
            if (sendBtn && input) {
                sendBtn.disabled = !input.value.trim() || !this.value;
            }
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', function() {
            if (confirm('This will clear your profile and return to Step 1. Continue?')) {
                pnClearLocalStorage();
                pnState.currentStep = 1;
                pnState.maxStepReached = 1;
                pnState.firm = { name: '', type: '', aum: '', regulations: [], governance: '' };
                pnState.fund = { name: '', strategy: '', geography: '', benchmark: '', riskBudget: 10, holdingPeriod: '' };
                pnState.portfolio = [];
                pnState.portfolioSkipped = false;
                pnState.assessment = { ipip: {}, crt: {}, philosophy: {}, bias: {}, preferences: {} };
                pnState.profile = null;
                pnState.chatHistory = [];
                pnState.chatTicker = '';
                pnState.assessmentBlock = 0;
                pnRefresh();
            }
        });
    }
}


// =========================================================================
// HELPERS
// =========================================================================

function bindTextInput(id, setter) {
    var el = document.getElementById(id);
    if (el) {
        el.addEventListener('input', function() {
            setter(this.value);
            pnSaveToLocalStorage();
            updateNextButton();
        });
    }
}

function bindSelectInput(id, setter) {
    var el = document.getElementById(id);
    if (el) {
        el.addEventListener('change', function() {
            setter(this.value);
            pnSaveToLocalStorage();
            updateNextButton();
        });
    }
}

function updateNextButton() {
    var btn = document.getElementById('pn-next');
    if (btn) {
        btn.disabled = !pnValidateStep(pnState.currentStep);
    }
}

function updateProgress() {
    var progress = pnAssessmentProgress();
    var fill = document.querySelector('.pn-progress-fill');
    var text = document.querySelector('.pn-progress-text');
    if (fill) fill.style.width = progress.percent + '%';
    if (text) text.textContent = progress.answered + ' / ' + progress.total + ' completed';

    var navItems = document.querySelectorAll('.pn-assessment-nav-item');
    for (var i = 0; i < navItems.length; i++) {
        var blockIdx = parseInt(navItems[i].getAttribute('data-block'), 10);
        if (pnBlockComplete(blockIdx)) {
            navItems[i].classList.add('complete');
        } else {
            navItems[i].classList.remove('complete');
        }
    }
}

function pnRefresh() {
    var wizard = document.getElementById('pn-wizard');
    if (!wizard) return;
    wizard.innerHTML = renderStepIndicator() +
        '<div class="pn-wizard-body" id="pn-wizard-body">' +
            renderCurrentStep() +
        '</div>' +
        renderWizardFooter();
    bindAll();
    wizard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function pnRefreshAssessment() {
    var contentEl = document.getElementById('pn-assessment-content');
    if (!contentEl) return;

    var contentHtml = '';
    switch (pnState.assessmentBlock) {
        case 0: contentHtml = renderIPIPBlock(); break;
        case 1: contentHtml = renderCRTBlock(); break;
        case 2: contentHtml = renderPhilosophyBlock(); break;
        case 3: contentHtml = renderBiasBlock(); break;
        case 4: contentHtml = renderPreferencesBlock(); break;
    }
    contentEl.innerHTML = contentHtml;

    var navItems = document.querySelectorAll('.pn-assessment-nav-item');
    for (var i = 0; i < navItems.length; i++) {
        var blockIdx = parseInt(navItems[i].getAttribute('data-block'), 10);
        navItems[i].classList.toggle('active', blockIdx === pnState.assessmentBlock);
    }

    bindAssessmentBlockInputs();
    updateProgress();
    updateNextButton();
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatMarkdown(text) {
    if (!text) return '';
    var html = escapeHtml(text);
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    var paragraphs = html.split(/\n\n+/);
    if (paragraphs.length > 1) {
        html = paragraphs.map(function(p) { return '<p>' + p.replace(/\n/g, '<br>') + '</p>'; }).join('');
    } else {
        html = html.replace(/\n/g, '<br>');
    }
    return html;
}


// =========================================================================
// WINDOW-EXPOSED FUNCTIONS
// =========================================================================

window.renderPersonalisationPage = function() {
    return renderPage();
};

window.initPersonalisationDemo = function() {
    pnLoadFromLocalStorage();
    var wizard = document.getElementById('pn-wizard');
    if (wizard && pnState.currentStep > 1) {
        wizard.innerHTML = renderStepIndicator() +
            '<div class="pn-wizard-body" id="pn-wizard-body">' +
                renderCurrentStep() +
            '</div>' +
            renderWizardFooter();
    }
    bindAll();
};

window.pnOnRouteEnter = function() {
    if (pnState.currentStep === 5) {
        renderChatMessages();
    }
};

})();
