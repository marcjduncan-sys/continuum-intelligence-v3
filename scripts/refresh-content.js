/**
 * refresh-content.js
 *
 * LLM-powered content refresh for the Continuum Intelligence platform.
 *
 * Runs after each automated pipeline cycle. Three LLM functions:
 *   A. Evidence extraction (Sonnet) — extracts ALL evidence items from new
 *      announcements with type-specific decay and diagnosticity assessment
 *   B. Narrative refresh (Sonnet) — refreshes plain_english, what_to_watch,
 *      big_picture when triggered by dislocation, staleness, or cumulative evidence
 *   C. Hypothesis review (Sonnet) — adaptive hypothesis restructuring when
 *      evidence patterns signal the framework needs revision
 *
 * Trigger logic:
 *   - Per-ticker adaptive cooldown (1h earnings, 2h critical, 4h high, 24h normal)
 *   - Cumulative evidence trigger (3+ new items since last narrative refresh)
 *   - Dislocation severity (HIGH/CRITICAL)
 *   - Staleness (>=7 days)
 *
 * Exits 0 always — non-critical step, never blocks the pipeline.
 *
 * CLI flags:
 *   --dry-run          Log what would change, make no writes
 *   --ticker XYZ       Process a single ticker only
 *   --force            Bypass cooldown
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DATA_DIR    = path.join(__dirname, '..', 'data');
const STOCKS_DIR  = path.join(DATA_DIR, 'stocks');

// Per-ticker adaptive cooldown (replaces global 24hr cooldown)
const COOLDOWN_NORMAL_MS   = 24 * 60 * 60 * 1000;  // 24 hours default
const COOLDOWN_HIGH_MS     = 4 * 60 * 60 * 1000;    // 4 hours during HIGH dislocation
const COOLDOWN_CRITICAL_MS = 2 * 60 * 60 * 1000;    // 2 hours during CRITICAL dislocation
const COOLDOWN_EARNINGS_MS = 1 * 60 * 60 * 1000;    // 1 hour on results day

// Urgency threshold (days since last_updated on any hypothesis)
const STALE_DAYS = 7;   // >=7 days without update -> MODERATE urgency trigger

// Cumulative evidence trigger: N new items since last narrative refresh
const CUMULATIVE_EVIDENCE_THRESHOLD = 3;

const MODELS = {
  evidence:  'claude-sonnet-4-6',   // Upgraded from Haiku: diagnosticity assessment requires Sonnet-class reasoning
  narrative: 'claude-sonnet-4-6',
  hypothesis_review: 'claude-sonnet-4-6',  // Quarterly adaptive hypothesis revision
};

const VALID_HYPOTHESIS_IMPACT = new Set(['CONSISTENT', 'INCONSISTENT', 'NEUTRAL']);
const VALID_EPISTEMIC_TAGS = new Set([
  'Under Oath (statutory)',
  'Independent (third-party)',
  'Motivated (corporate)',
  'Speculative (media)',
  'Proprietary (internal)',
]);

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const args     = process.argv.slice(2);
const DRY_RUN  = args.includes('--dry-run');
const FORCE    = args.includes('--force');
const tickerIdx = args.indexOf('--ticker');
const ONLY_TICKER = tickerIdx !== -1 ? (args[tickerIdx + 1] || '').toUpperCase() : null;

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function log(msg)  { console.log(`[refresh-content] ${msg}`); }
function warn(msg) { console.warn(`[refresh-content] WARN: ${msg}`); }

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function stockPath(ticker) {
  return path.join(STOCKS_DIR, `${ticker}.json`);
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

function loadData() {
  const livePrices       = readJson(path.join(DATA_DIR, 'live-prices.json'))       || {};
  const narrativeAnalysis = readJson(path.join(DATA_DIR, 'narrative-analysis.json')) || { results: {} };
  const announcements    = readJson(path.join(DATA_DIR, 'announcements.json'))     || { announcements: {} };
  return { livePrices, narrativeAnalysis, announcements };
}

function listStockTickers() {
  return fs.readdirSync(STOCKS_DIR)
    .filter(f => f.endsWith('.json') && !f.includes('-history'))
    .map(f => f.replace('.json', ''))
    .sort();
}

// ---------------------------------------------------------------------------
// Trigger gate
// ---------------------------------------------------------------------------

/**
 * Returns { shouldRun, reasons, hasNewAnnouncements, needsNarrativeRefresh }
 */
function evaluateTriggers(stock, ticker, narrativeAnalysis, tickerAnnouncements, now) {
  const reasons = [];
  let hasNewAnnouncements = false;
  let needsNarrativeRefresh = false;

  // Determine dislocation severity for adaptive cooldown
  const naResult = narrativeAnalysis.results && narrativeAnalysis.results[ticker];
  const dislocationSeverity = (naResult && naResult.dislocation) ? naResult.dislocation.severity : 'NORMAL';

  // Detect if this is a results day (check events)
  let isEarningsDay = false;
  try {
    const eventsPath = path.join(DATA_DIR, 'events', ticker + '.json');
    if (fs.existsSync(eventsPath)) {
      const events = JSON.parse(fs.readFileSync(eventsPath, 'utf8'));
      const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
      for (const ev of (events.events || events || [])) {
        const evDate = new Date(ev.date || ev.datetime);
        if (Math.abs(evDate.getTime() - now) < TWO_DAYS_MS) {
          const type = (ev.type || ev.category || '').toLowerCase();
          if (type.includes('result') || type.includes('earn')) isEarningsDay = true;
        }
      }
    }
  } catch (_) { /* no events data */ }

  // Per-ticker adaptive cooldown
  const cooldownMs = isEarningsDay ? COOLDOWN_EARNINGS_MS
    : dislocationSeverity === 'CRITICAL' ? COOLDOWN_CRITICAL_MS
    : dislocationSeverity === 'HIGH' ? COOLDOWN_HIGH_MS
    : COOLDOWN_NORMAL_MS;

  if (!FORCE && stock.last_llm_refresh) {
    const lastRefresh = new Date(stock.last_llm_refresh).getTime();
    const elapsed = now - lastRefresh;
    if (elapsed < cooldownMs) {
      const hoursLeft = ((cooldownMs - elapsed) / 3600000).toFixed(1);
      const regime = isEarningsDay ? 'earnings-day' : dislocationSeverity.toLowerCase();
      return { shouldRun: false, reasons: [`cooldown-${regime} (${hoursLeft}h remaining)`], hasNewAnnouncements: false, needsNarrativeRefresh: false };
    }
  }

  // Check for new announcements since last refresh
  if (Array.isArray(tickerAnnouncements) && tickerAnnouncements.length > 0) {
    const lastRefresh = stock.last_llm_refresh ? new Date(stock.last_llm_refresh).getTime() : 0;
    const newAnns = tickerAnnouncements.filter(a => {
      const annDate = new Date(a.date || a.datetime || 0).getTime();
      return annDate > lastRefresh;
    });
    if (newAnns.length > 0) {
      hasNewAnnouncements = true;
      reasons.push(`${newAnns.length} new ASX announcement(s)`);
    }
  }

  // Check dislocation severity from narrative-analysis.json
  if (dislocationSeverity === 'CRITICAL' || dislocationSeverity === 'HIGH') {
    needsNarrativeRefresh = true;
    reasons.push(`dislocation severity ${dislocationSeverity}`);
  }

  // Cumulative evidence trigger: if N+ new evidence items since last narrative refresh
  if (!needsNarrativeRefresh) {
    const lastNarrativeRefresh = stock.last_narrative_refresh
      ? new Date(stock.last_narrative_refresh).getTime() : 0;
    const newEvidenceCount = (stock.evidence_items || []).filter(e => {
      const eDate = e.date ? new Date(e.date).getTime() : 0;
      return eDate > lastNarrativeRefresh;
    }).length;
    if (newEvidenceCount >= CUMULATIVE_EVIDENCE_THRESHOLD) {
      needsNarrativeRefresh = true;
      reasons.push(`${newEvidenceCount} evidence items since last narrative refresh`);
    }
  }

  // Check staleness: days since last hypothesis update
  if (!needsNarrativeRefresh && stock.hypotheses) {
    const tiers = Object.values(stock.hypotheses);
    const lastUpdated = tiers
      .map(h => h.last_updated ? new Date(h.last_updated).getTime() : 0)
      .reduce((a, b) => Math.max(a, b), 0);
    if (lastUpdated > 0) {
      const daysSince = (now - lastUpdated) / (1000 * 60 * 60 * 24);
      if (daysSince >= STALE_DAYS) {
        needsNarrativeRefresh = true;
        reasons.push(`content ${Math.floor(daysSince)} days old`);
      }
    } else {
      needsNarrativeRefresh = true;
      reasons.push('no last_updated timestamp');
    }
  }

  const shouldRun = hasNewAnnouncements || needsNarrativeRefresh;
  return { shouldRun, reasons, hasNewAnnouncements, needsNarrativeRefresh };
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

function buildEvidencePrompt(stock, ticker, newAnnouncements) {
  const annText = newAnnouncements.map((a, i) =>
    `[${i + 1}] DATE: ${a.date || a.datetime || 'unknown'}\nHEADLINE: ${a.headline || a.title || ''}\nSUMMARY: ${a.summary || a.body || ''}`
  ).join('\n\n');

  const hypotheses = Object.entries(stock.hypotheses || {})
    .map(([tier, h]) => `${tier} (${h.label}): ${h.description}`)
    .join('\n');

  return `You are an equity research analyst updating an ACH (Analysis of Competing Hypotheses) evidence log for ${stock.company || ticker} (ASX: ${ticker}).

HYPOTHESES UNDER TEST:
${hypotheses}

NEW ASX ANNOUNCEMENTS:
${annText}

Extract ONE evidence item per announcement. For each, assess:
1. DIAGNOSTICITY: Would this evidence look different if an alternative hypothesis were true? High diagnosticity = the evidence strongly discriminates between hypotheses. Low = consistent with most hypotheses.
2. HYPOTHESIS_IMPACT: For each hypothesis, would a rational analyst holding ONLY that hypothesis expect this evidence? CONSISTENT = yes. INCONSISTENT = they would be surprised. NEUTRAL = irrelevant.
3. DECAY: Set decay parameters based on evidence type:
   - EARNINGS_REPORT: full_weight_days: 80, half_life_days: 45 (decays as next quarter approaches)
   - MANAGEMENT_GUIDANCE: full_weight_days: 60, half_life_days: 60
   - OPERATIONAL_DATA: full_weight_days: 45, half_life_days: 30
   - REGULATORY: full_weight_days: 365, half_life_days: 365 (near-permanent)
   - CAPITAL_MARKETS: full_weight_days: 30, half_life_days: 30
   - INDUSTRY_DATA: full_weight_days: 90, half_life_days: 60
   - ANALYST_NOTE: full_weight_days: 30, half_life_days: 20
   - MACRO: full_weight_days: 60, half_life_days: 45

Respond with ONLY a JSON array — no markdown, no explanation. One object per announcement:
[
  {
    "id": "string (TICKER_DESCRIPTOR in SCREAMING_SNAKE_CASE, e.g. ${ticker}_Q3_SALES_UPDATE)",
    "type": "one of: EARNINGS_REPORT | MANAGEMENT_GUIDANCE | OPERATIONAL_DATA | INDUSTRY_DATA | REGULATORY | CAPITAL_MARKETS | ANALYST_NOTE | MACRO",
    "source": "brief source name (e.g. ASX Filing, Company Presentation, Media Report)",
    "epistemic_tag": "one of: Under Oath (statutory) | Independent (third-party) | Motivated (corporate) | Speculative (media) | Proprietary (internal)",
    "date": "ISO 8601 date string",
    "summary": "1-2 sentence factual summary of what was announced",
    "diagnosticity": "one of: VERY_HIGH | HIGH | MEDIUM | LOW | VERY_LOW",
    "hypothesis_impact": {
      "D1": "one of: CONSISTENT | INCONSISTENT | NEUTRAL",
      "D2": "one of: CONSISTENT | INCONSISTENT | NEUTRAL",
      "D3": "one of: CONSISTENT | INCONSISTENT | NEUTRAL",
      "D4": "one of: CONSISTENT | INCONSISTENT | NEUTRAL"
    },
    "decay": {
      "full_weight_days": "integer — see decay guidelines above",
      "half_life_days": "integer — see decay guidelines above"
    },
    "active": true
  }
]

If an announcement is trivial noise (routine appendix filings, director interest changes with no material import), exclude it entirely. Only extract genuinely informative evidence.`;
}

function buildNarrativePrompt(stock, ticker, naResult, priceData) {
  const hypotheses = Object.entries(stock.hypotheses || {})
    .map(([tier, h]) => {
      const evidenceForTier = (stock.evidence_items || [])
        .filter(e => e.hypothesis_impact && e.hypothesis_impact[tier] && e.hypothesis_impact[tier] !== 'NEUTRAL')
        .slice(0, 3)
        .map(e => `    [${e.hypothesis_impact[tier]}] ${e.date ? e.date.substring(0, 10) : ''}: ${e.summary} (${e.diagnosticity}, ${e.epistemic_tag})`)
        .join('\n');
      return `${tier} "${h.label}" (survival: ${h.survival_score}, status: ${h.status}):
  Description: ${h.description}
  Current plain_english: ${h.plain_english || 'none'}
  Current what_to_watch: ${h.what_to_watch || 'none'}
  Key evidence:
${evidenceForTier || '    No tier-specific evidence yet.'}`;
    }).join('\n\n');

  const recentEvidence = (stock.evidence_items || []).slice(0, 8)
    .map(e => `- [${e.epistemic_tag}] ${e.date ? e.date.substring(0, 10) : ''}: ${e.summary} (diagnosticity: ${e.diagnosticity})`)
    .join('\n');

  // Build richer market context
  const disloc = naResult && naResult.dislocation;
  const metrics = disloc ? disloc.metrics || {} : {};
  const dislocInfo = disloc
    ? `Dislocation severity: ${disloc.severity} | Pattern: ${disloc.pattern || 'unknown'}
Price: A$${metrics.currentPrice ?? 'N/A'} | Peak: A$${metrics.peakPrice ?? 'N/A'} | Drawdown from peak: ${metrics.drawdownFromPeak ?? 'N/A'}%
52wk range position: ${metrics.rangePosition != null ? (metrics.rangePosition * 100).toFixed(1) + '%' : 'N/A'} | Z-score: ${metrics.zScore ?? 'N/A'} | Volume ratio: ${metrics.volumeRatio ?? 'N/A'}x`
    : 'Dislocation: data unavailable';

  const priceInfo = priceData
    ? `Current price: A$${priceData.price ?? 'N/A'} | Daily change: ${priceData.changePercent ?? 'N/A'}%`
    : '';

  // Sector and identity context
  const sector = stock.identity?.sector || stock.sector || 'Unknown sector';
  const marketCap = stock.identity?.market_cap || stock.market_cap;
  const capStr = marketCap ? `Market cap: A$${(marketCap / 1e9).toFixed(1)}B` : '';

  return `COMPANY: ${stock.company || ticker} (ASX: ${ticker}) | ${sector} | ${capStr}

MARKET DATA:
${dislocInfo}
${priceInfo}

CURRENT BIG PICTURE:
${stock.big_picture || 'No existing big picture.'}

HYPOTHESES (do NOT change survival_score, status, label, or description):
${hypotheses}

FULL EVIDENCE LOG (most recent first):
${recentEvidence || 'No evidence items yet.'}

TASK: Rewrite the commentary fields to institutional research standard. Your output will appear in investor briefings read by fund managers.

QUALITY RULES (enforced — outputs that violate these will be rejected and re-run):
1. Every what_to_watch MUST name a specific observable: a metric, a date, a filing, a contract, or a regulatory decision. Generic phrases like "next earnings result", "margin trends", "competitive dynamics", or "macro headwinds" are FORBIDDEN.
2. Every plain_english MUST lead with the variant perception (what this hypothesis claims the market is mispricing), include at least one quantified claim, and close with the key assumption that must hold.
3. big_picture first sentence: the single most important thing happening at this company right now. Second sentence: what the market is pricing vs what evidence suggests. Third sentence: the key unresolved question.
4. No HTML tags. Plain text only.
5. Do not use the words "remains", "continues", "ongoing", or "landscape" — these are markers of lazy prose.

EXAMPLE of institutional-quality what_to_watch (for reference only — do NOT copy):
"FY25 interim Pilbara C1 costs (due Feb 2025). If >US$18/t vs FY24's $15.40/t, it validates the cost inflation thesis and pressures the dividend floor. Below $16/t keeps the cash machine narrative intact. Secondary watch: India crude steel output data (monthly, WorldSteel) as the marginal demand driver replacing China property."

Respond with ONLY a JSON object — no markdown, no commentary:
{
  "big_picture": "3 sentences as specified above",
  "hypotheses": {
    "D1": {
      "plain_english": "3-4 sentences: variant perception, quantified thesis, supporting evidence, key assumption",
      "what_to_watch": "2-3 sentences: specific metric + date + threshold + consequence. Then secondary catalyst."
    },
    "D2": { "plain_english": "...", "what_to_watch": "..." },
    "D3": { "plain_english": "...", "what_to_watch": "..." },
    "D4": { "plain_english": "...", "what_to_watch": "..." }
  }
}`;
}

// ---------------------------------------------------------------------------
// System prompts — persona and quality standards by mode
// ---------------------------------------------------------------------------

const SYSTEM_PROMPTS = {
  evidence: `You are a senior equity research analyst at a top-tier investment bank. Your role is to extract and classify evidence items from ASX company announcements with rigorous diagnosticity assessment. You think in terms of hypothesis discrimination: evidence matters only to the extent it differentiates between competing explanations. You never extract noise. Write summaries in Australian English. Never use em-dashes; use commas or semicolons instead.`,

  narrative: `You are a senior equity research analyst at Goldman Sachs covering ASX-listed equities. Your written output is read by portfolio managers allocating institutional capital. Your prose must meet these non-negotiable standards:

LANGUAGE AND STYLE:
- Australian English throughout (Macquarie Dictionary conventions): "analyse" not "analyze", "defence" not "defense", "programme" not "program" (except computing), "labour" not "labor", "capitalise" not "capitalize"
- NEVER use em-dashes. Use commas, semicolons, colons, or full stops instead
- NEVER use the # symbol in prose. Write "number" or use the specific figure
- No bullet points, asterisks, or markdown formatting in output text
- No LLM verbal tics: do not use "delve", "leverage" (as a verb), "notably", "it's worth noting", "in terms of", "moving forward", "robust", "bolster", "underscores", "landscape", "paradigm", "synergy", "holistic"
- Write in the third person. No "we believe" or "our view"
- Sentences should be direct and declarative. Vary sentence length. Short sentences for emphasis. Longer sentences for nuanced conditional reasoning

VOICE AND PRECISION:
- Write with the authority of someone who has covered this sector for 15 years
- Every sentence must contain either a specific number, a named catalyst, a date anchor, or a falsifiable claim
- Never write a sentence that could apply to any company. If you could swap the ticker and the sentence still works, delete it
- Use present tense for current conditions, future tense only for dated catalysts
- No hedging language ("may", "could potentially", "it remains to be seen"). State the condition and its probability or consequence
- No generic phrases: "margin trends", "competitive dynamics", "macro headwinds" are banned. Name the specific margin (EBITDA, gross, FCF), the specific competitor, the specific macro variable

WHAT_TO_WATCH STANDARD:
- Each what_to_watch MUST name a specific observable event with a timeframe
- Format: "[Specific metric/event] by [date/period]. If [threshold], then [consequence for hypothesis]."
- Example: "Pilbara C1 costs in FY25 interim. If >US$18/t, margin compression thesis strengthens; if <$16/t, cash generation narrative intact."
- NEVER output generic phrases like "next earnings result", "margin trends and competitive dynamics", or "industry disruption signals"

PLAIN_ENGLISH STANDARD:
- Lead with the variant perception: what does this hypothesis claim that the market is mispricing?
- Quantify the thesis where possible (revenue CAGR, margin delta, multiple re-rating range)
- Name the 1-2 evidence items that most strongly support or threaten this hypothesis right now
- Close with the key assumption that must hold for this hypothesis to survive

BIG_PICTURE STANDARD:
- First sentence: the single most important thing happening at this company right now
- Second sentence: what the market is pricing vs what the evidence suggests
- Third sentence: the key unresolved question that determines which hypothesis dominates`,

  hypothesis_review: `You are a senior equity research analyst conducting a structural review of the hypothesis framework for an ASX-listed company. Your role is to identify when the existing D1-D4 framework no longer captures the most important competing explanations for the stock's trajectory. You are conservative: only recommend changes when the evidence pattern clearly demands it. You think in terms of what a rational Bayesian analyst would do.`,
};

// ---------------------------------------------------------------------------
// Claude API wrapper
// ---------------------------------------------------------------------------

async function callClaude(client, model, prompt, ticker, mode) {
  try {
    const tokenLimit = (mode === 'narrative') ? 4096
      : (mode === 'evidence' || mode === 'hypothesis_review') ? 4096
      : 2048;

    const messages = [{ role: 'user', content: prompt }];
    const systemPrompt = SYSTEM_PROMPTS[mode] || undefined;

    const createParams = {
      model,
      max_tokens: tokenLimit,
      messages,
    };
    if (systemPrompt) {
      createParams.system = systemPrompt;
    }

    const message = await client.messages.create(createParams);

    let text = (message.content[0]?.text || '').trim();

    // Strip markdown code fences if present
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

    const parsed = JSON.parse(text);
    return parsed;
  } catch (err) {
    warn(`[${ticker}] ${mode} call failed: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

function validateEvidenceItem(item, ticker) {
  const required = ['id', 'type', 'source', 'epistemic_tag', 'date', 'summary', 'diagnosticity', 'hypothesis_impact', 'decay', 'active'];
  for (const field of required) {
    if (item[field] === undefined || item[field] === null) {
      warn(`[${ticker}] evidence item missing field: ${field}`);
      return false;
    }
  }
  const impact = item.hypothesis_impact || {};
  for (const tier of ['D1', 'D2', 'D3', 'D4']) {
    if (!VALID_HYPOTHESIS_IMPACT.has(impact[tier])) {
      warn(`[${ticker}] invalid hypothesis_impact.${tier}: ${impact[tier]}`);
      return false;
    }
  }
  if (!VALID_EPISTEMIC_TAGS.has(item.epistemic_tag)) {
    warn(`[${ticker}] invalid epistemic_tag: ${item.epistemic_tag} — correcting to 'Motivated (corporate)'`);
    item.epistemic_tag = 'Motivated (corporate)';
  }
  return true;
}

function applyEvidenceItem(stock, newItem) {
  // Avoid duplicates by id
  const existing = stock.evidence_items || [];
  if (existing.find(e => e.id === newItem.id)) {
    return false;
  }
  stock.evidence_items = [newItem, ...existing];
  return true;
}

// ---------------------------------------------------------------------------
// Boilerplate detection — reject generic LLM outputs
// ---------------------------------------------------------------------------

const BOILERPLATE_PHRASES = [
  'next earnings result',
  'margin trends and competitive dynamics',
  'cost pressures, competitive threats, or macro headwinds',
  'industry disruption signals and regulatory changes',
  'next earnings result and forward guidance',
  'margin trends',
  'competitive dynamics',
  'remains to be seen',
  'it will be important to monitor',
  'key metrics to watch',
  'investors should monitor',
  'the company continues to',
  'going forward',
];

const BANNED_PROSE_WORDS = ['landscape', 'remains', 'ongoing'];

function isBoilerplate(text) {
  if (!text || typeof text !== 'string') return true;
  const lower = text.toLowerCase().trim();

  // Check against known generic phrases
  for (const phrase of BOILERPLATE_PHRASES) {
    if (lower.includes(phrase)) return true;
  }

  // what_to_watch must contain at least one number, date reference, or specific metric name
  // Heuristic: if the text has no digits and no month/quarter/FY reference, it's likely generic
  const hasSpecificity = /\d/.test(text) ||
    /(?:FY|H[12]|Q[1-4]|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|2024|2025|2026|2027)/i.test(text) ||
    /(?:US\$|A\$|AUD|bps|pp\b|%|\$)/i.test(text);

  return !hasSpecificity;
}

/**
 * Sanitise LLM output: strip HTML, em-dashes, markdown artefacts, and LLM verbal tics.
 */
function sanitiseProse(text) {
  if (!text || typeof text !== 'string') return text;
  let s = text;
  // Strip HTML tags
  s = s.replace(/<[^>]+>/g, '');
  // Replace em-dashes and en-dashes with semicolons or commas
  s = s.replace(/\u2014/g, '; ');  // em-dash
  s = s.replace(/\u2013/g, ', ');  // en-dash
  s = s.replace(/--/g, '; ');      // double-hyphen em-dash
  // Strip markdown bold/italic markers
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1');
  s = s.replace(/\*([^*]+)\*/g, '$1');
  s = s.replace(/__([^_]+)__/g, '$1');
  s = s.replace(/_([^_]+)_/g, '$1');
  // Strip # heading markers
  s = s.replace(/^#+\s*/gm, '');
  // Strip bullet points
  s = s.replace(/^[\s]*[-*]\s+/gm, '');
  // Clean up multiple spaces
  s = s.replace(/\s{2,}/g, ' ').trim();
  return s;
}

function validateNarrativeQuality(updates, ticker) {
  if (!updates || !updates.hypotheses) return updates;

  let boilerplateCount = 0;
  for (const [tier, hyp] of Object.entries(updates.hypotheses)) {
    if (hyp.what_to_watch && isBoilerplate(hyp.what_to_watch)) {
      warn(`[${ticker}] ${tier} what_to_watch is boilerplate, rejecting: "${hyp.what_to_watch.substring(0, 80)}..."`);
      delete hyp.what_to_watch; // Remove so it doesn't overwrite existing (potentially better) text
      boilerplateCount++;
    }
    // Sanitise all prose fields
    if (hyp.plain_english) {
      hyp.plain_english = sanitiseProse(hyp.plain_english);
    }
    if (hyp.what_to_watch) {
      hyp.what_to_watch = sanitiseProse(hyp.what_to_watch);
    }
  }
  if (updates.big_picture) {
    updates.big_picture = sanitiseProse(updates.big_picture);
  }

  if (boilerplateCount > 0) {
    warn(`[${ticker}] ${boilerplateCount}/${Object.keys(updates.hypotheses).length} what_to_watch fields rejected as boilerplate`);
  }

  return updates;
}

function applyNarrativeRefresh(stock, updates) {
  // Run quality gate before applying
  updates = validateNarrativeQuality(updates, stock.ticker || 'UNKNOWN');

  let changed = false;

  if (updates.big_picture && typeof updates.big_picture === 'string') {
    stock.big_picture = updates.big_picture;
    changed = true;
  }

  if (updates.hypotheses && stock.hypotheses) {
    for (const [tier, hyp] of Object.entries(updates.hypotheses)) {
      if (!stock.hypotheses[tier]) continue;
      if (hyp.plain_english && typeof hyp.plain_english === 'string') {
        stock.hypotheses[tier].plain_english = hyp.plain_english;
        changed = true;
      }
      if (hyp.what_to_watch && typeof hyp.what_to_watch === 'string') {
        stock.hypotheses[tier].what_to_watch = hyp.what_to_watch;
        changed = true;
      }
      // Explicitly do NOT touch: survival_score, status, label, description, upside, risk_plain, diagnosticity, decay
    }
  }

  return changed;
}

// ---------------------------------------------------------------------------
// Hypothesis Revision — adaptive hypothesis restructuring
// ---------------------------------------------------------------------------

// Threshold: trigger hypothesis review when evidence pattern signals structural change
const HYPOTHESIS_REVIEW_TRIGGERS = {
  MIN_EVIDENCE_ITEMS: 8,         // Need enough evidence to assess pattern
  VERY_LOW_SCORE_THRESHOLD: 0.12, // Hypothesis effectively dead
  HIGH_SCORE_THRESHOLD: 0.65,     // Hypothesis dominant
  MIN_DAYS_SINCE_ONBOARD: 30,     // Don't restructure freshly onboarded stocks
  MIN_DAYS_SINCE_LAST_REVIEW: 60, // Cooldown between structural reviews
};

function shouldReviewHypotheses(stock, ticker) {
  const hyps = stock.hypotheses || {};
  const tiers = Object.values(hyps);
  const evidence = stock.evidence_items || [];

  // Need sufficient evidence history
  if (evidence.length < HYPOTHESIS_REVIEW_TRIGGERS.MIN_EVIDENCE_ITEMS) return false;

  // Don't review too frequently
  if (stock.last_hypothesis_review) {
    const daysSince = (Date.now() - new Date(stock.last_hypothesis_review).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < HYPOTHESIS_REVIEW_TRIGGERS.MIN_DAYS_SINCE_LAST_REVIEW) return false;
  }

  // Trigger conditions (any one is sufficient):
  // 1. A hypothesis has collapsed below VERY_LOW threshold
  const hasCollapsed = tiers.some(h => h.survival_score <= HYPOTHESIS_REVIEW_TRIGGERS.VERY_LOW_SCORE_THRESHOLD);

  // 2. Dominant hypothesis has flipped 3+ times (oscillation = poor hypothesis framing)
  const flipCount = (stock.narrative_history || []).length;
  const hasOscillation = flipCount >= 3;

  // 3. All hypotheses clustered within 10pts (no discrimination = hypotheses not distinctive enough)
  const scores = tiers.map(h => h.survival_score);
  const spread = Math.max(...scores) - Math.min(...scores);
  const noDiscrimination = spread < 0.10;

  // 4. Evidence consistently NEUTRAL across all hypotheses (hypotheses not capturing what matters)
  const recentEvidence = evidence.slice(0, 10);
  const neutralDominant = recentEvidence.filter(e => {
    const impacts = Object.values(e.hypothesis_impact || {});
    return impacts.every(i => i === 'NEUTRAL');
  }).length >= 5;

  return hasCollapsed || hasOscillation || noDiscrimination || neutralDominant;
}

function buildHypothesisReviewPrompt(stock, ticker) {
  const hypotheses = Object.entries(stock.hypotheses || {})
    .map(([tier, h]) => {
      return `${tier} "${h.label}" (survival: ${h.survival_score}, status: ${h.status}):
  - Description: ${h.description}
  - Evidence support pattern: ${summariseEvidencePattern(stock.evidence_items || [], tier)}`;
    }).join('\n\n');

  const recentEvidence = (stock.evidence_items || []).slice(0, 10)
    .map(e => `- [${e.epistemic_tag}] ${e.date ? e.date.substring(0, 10) : ''}: ${e.summary} (diagnosticity: ${e.diagnosticity})`)
    .join('\n');

  const flipHistory = (stock.narrative_history || []).slice(-5)
    .map(f => `- ${f.date}: ${f.from} -> ${f.to} (trigger: ${f.trigger})`)
    .join('\n');

  return `You are a senior equity research analyst reviewing whether the hypothesis framework for ${stock.company || ticker} (ASX: ${ticker}) needs structural revision.

CURRENT HYPOTHESES:
${hypotheses}

RECENT EVIDENCE (most recent first):
${recentEvidence}

NARRATIVE FLIP HISTORY:
${flipHistory || 'None'}

BIG PICTURE: ${stock.big_picture || 'none'}

REVIEW TASK:
Assess whether the current D1-D4 hypothesis framework adequately captures the key drivers of this stock's value. Consider:
1. Is any hypothesis now irrelevant or structurally dead?
2. Has a new material thesis emerged that the framework doesn't capture?
3. Are hypotheses too similar (poor discrimination) or too broad?
4. Is the evidence pattern suggesting something the hypotheses don't address?

Respond with ONLY a JSON object — no markdown, no explanation:
{
  "revision_needed": true/false,
  "confidence": "HIGH | MODERATE | LOW",
  "reasoning": "1-2 sentences explaining why revision is or isn't needed",
  "proposed_changes": [
    {
      "tier": "D1/D2/D3/D4",
      "action": "REPLACE | REFINE | KEEP",
      "new_label": "new label if REPLACE/REFINE, null if KEEP",
      "new_description": "new description if REPLACE/REFINE, null if KEEP",
      "rationale": "1 sentence explaining why"
    }
  ]
}

CONSTRAINTS:
- At most 2 hypotheses can be changed per review (stability matters)
- REPLACE means the old hypothesis is archived and a new one takes its slot
- REFINE means the label/description are updated but the core thesis evolves
- You must always retain at least one bull, one base, and one bear hypothesis
- New hypotheses must be specific and falsifiable, not vague`;
}

function summariseEvidencePattern(evidenceItems, tier) {
  const relevant = evidenceItems.filter(e => e.hypothesis_impact && e.hypothesis_impact[tier]);
  if (relevant.length === 0) return 'No evidence mapped';
  const counts = { CONSISTENT: 0, INCONSISTENT: 0, NEUTRAL: 0 };
  for (const e of relevant) {
    const impact = e.hypothesis_impact[tier];
    if (counts[impact] !== undefined) counts[impact]++;
  }
  return `${counts.CONSISTENT}C / ${counts.INCONSISTENT}I / ${counts.NEUTRAL}N (of ${relevant.length} items)`;
}

function applyHypothesisRevision(stock, reviewResult, ticker) {
  if (!reviewResult || !reviewResult.revision_needed || !Array.isArray(reviewResult.proposed_changes)) {
    return false;
  }

  let changed = false;
  const changes = reviewResult.proposed_changes.filter(c => c.action !== 'KEEP');

  // Hard limit: max 2 changes per review
  const toApply = changes.slice(0, 2);

  for (const change of toApply) {
    const tier = change.tier;
    if (!stock.hypotheses[tier]) continue;

    if (change.action === 'REPLACE' || change.action === 'REFINE') {
      // Archive the old hypothesis
      if (!stock.hypothesis_archive) stock.hypothesis_archive = [];
      stock.hypothesis_archive.push({
        tier,
        archived_at: new Date().toISOString(),
        label: stock.hypotheses[tier].label,
        description: stock.hypotheses[tier].description,
        final_survival_score: stock.hypotheses[tier].survival_score,
        reason: change.rationale
      });

      // Apply the revision
      if (change.new_label) stock.hypotheses[tier].label = change.new_label;
      if (change.new_description) stock.hypotheses[tier].description = change.new_description;

      // Reset score for replaced hypotheses (start at prior probability)
      if (change.action === 'REPLACE') {
        stock.hypotheses[tier].survival_score = 0.25; // Equal prior
        stock.hypotheses[tier].status = 'MODERATE';
      }

      stock.hypotheses[tier].last_revised = new Date().toISOString();
      stock.hypotheses[tier].revision_type = change.action;
      changed = true;
      log(`[${ticker}] hypothesis ${tier} ${change.action}: "${change.new_label || stock.hypotheses[tier].label}" — ${change.rationale}`);
    }
  }

  if (changed) {
    stock.last_hypothesis_review = new Date().toISOString();
    stock.hypothesis_review_result = {
      date: new Date().toISOString(),
      confidence: reviewResult.confidence,
      reasoning: reviewResult.reasoning,
      changes_applied: toApply.length
    };
  }

  return changed;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  log(`Starting${DRY_RUN ? ' (DRY RUN)' : ''}${FORCE ? ' (FORCE)' : ''}${ONLY_TICKER ? ` (ticker: ${ONLY_TICKER})` : ''}`);

  if (!process.env.ANTHROPIC_API_KEY) {
    warn('ANTHROPIC_API_KEY not set — skipping all LLM calls');
    process.exit(0);
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const { livePrices, narrativeAnalysis, announcements } = loadData();
  const now = Date.now();

  const tickers = ONLY_TICKER ? [ONLY_TICKER] : listStockTickers();
  let refreshed = 0;

  for (const ticker of tickers) {
    const sPath = stockPath(ticker);
    const stock = readJson(sPath);
    if (!stock) {
      warn(`Could not read ${ticker}.json — skipping`);
      continue;
    }

    const tickerAnnouncements = (announcements.announcements || {})[ticker] || [];
    const naResult = (narrativeAnalysis.results || {})[ticker] || null;
    const priceData = livePrices[ticker] || livePrices[`${ticker}.AX`] || null;

    const { shouldRun, reasons, hasNewAnnouncements, needsNarrativeRefresh } =
      evaluateTriggers(stock, ticker, narrativeAnalysis, tickerAnnouncements, now);

    if (!shouldRun) {
      log(`[${ticker}] skip — ${reasons.join(', ')}`);
      continue;
    }

    log(`[${ticker}] triggered — ${reasons.join(', ')}`);

    let stockChanged = false;

    // --- Evidence extraction (Sonnet — upgraded from Haiku for diagnosticity quality) ---
    if (hasNewAnnouncements) {
      const lastRefresh = stock.last_llm_refresh ? new Date(stock.last_llm_refresh).getTime() : 0;
      const newAnns = tickerAnnouncements.filter(a => {
        const annDate = new Date(a.date || a.datetime || 0).getTime();
        return annDate > lastRefresh;
      });

      log(`[${ticker}] extracting evidence from ${newAnns.length} announcement(s) via Sonnet`);

      if (!DRY_RUN) {
        const evidenceResult = await callClaude(client, MODELS.evidence, buildEvidencePrompt(stock, ticker, newAnns), ticker, 'evidence');

        // Handle both array (new format) and single object (legacy) responses
        const evidenceItems = Array.isArray(evidenceResult) ? evidenceResult
          : (evidenceResult && typeof evidenceResult === 'object' && evidenceResult.id) ? [evidenceResult]
          : [];

        let addedCount = 0;
        for (const item of evidenceItems) {
          if (validateEvidenceItem(item, ticker)) {
            const applied = applyEvidenceItem(stock, item);
            if (applied) {
              addedCount++;
              log(`[${ticker}] evidence item added: ${item.id}`);
              stockChanged = true;
            } else {
              log(`[${ticker}] evidence item skipped (duplicate id: ${item.id})`);
            }
          }
        }
        if (addedCount > 0) {
          log(`[${ticker}] ${addedCount} evidence item(s) ingested from ${newAnns.length} announcement(s)`);
        }
      } else {
        log(`[${ticker}] DRY RUN: would call Sonnet for evidence extraction`);
      }
    }

    // --- Narrative refresh (Sonnet) ---
    if (needsNarrativeRefresh) {
      log(`[${ticker}] refreshing narrative via Sonnet`);

      if (!DRY_RUN) {
        const narrativeUpdates = await callClaude(client, MODELS.narrative, buildNarrativePrompt(stock, ticker, naResult, priceData), ticker, 'narrative');
        if (narrativeUpdates) {
          const changed = applyNarrativeRefresh(stock, narrativeUpdates);
          if (changed) {
            stock.last_narrative_refresh = new Date().toISOString();
            log(`[${ticker}] narrative refreshed`);
            stockChanged = true;
          }
        }
      } else {
        log(`[${ticker}] DRY RUN: would call Sonnet for narrative refresh`);
      }
    }

    // --- Hypothesis structure review (Sonnet) ---
    if (shouldReviewHypotheses(stock, ticker)) {
      log(`[${ticker}] hypothesis framework review triggered`);

      if (!DRY_RUN) {
        const reviewResult = await callClaude(client, MODELS.hypothesis_review,
          buildHypothesisReviewPrompt(stock, ticker), ticker, 'hypothesis_review');
        if (reviewResult) {
          const revised = applyHypothesisRevision(stock, reviewResult, ticker);
          if (revised) {
            log(`[${ticker}] hypothesis framework revised`);
            stockChanged = true;
          } else {
            log(`[${ticker}] hypothesis review: no changes needed (${reviewResult.reasoning || 'framework adequate'})`);
          }
        }
      } else {
        log(`[${ticker}] DRY RUN: would call Sonnet for hypothesis review`);
      }
    }

    // --- Write back ---
    if (stockChanged && !DRY_RUN) {
      stock.last_llm_refresh = new Date().toISOString();
      writeJson(sPath, stock);
      log(`[${ticker}] written to disk`);
      refreshed++;
    } else if (DRY_RUN) {
      log(`[${ticker}] DRY RUN: no write performed`);
    }
  }

  log(`Done. ${refreshed} stock(s) refreshed.`);
  process.exit(0);
}

main().catch(err => {
  console.error('[refresh-content] Fatal error:', err.message);
  process.exit(0); // Always exit 0 — non-critical step
});
