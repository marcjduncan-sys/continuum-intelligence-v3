/**
 * refresh-content.js
 *
 * LLM-powered content refresh for the Continuum Intelligence platform.
 *
 * Runs after each automated pipeline cycle. Selectively refreshes:
 *   - evidence_items (Haiku) when new ASX announcements are detected
 *   - plain_english, what_to_watch, big_picture (Sonnet) when freshness
 *     urgency is MODERATE or above, or dislocation is HIGH/CRITICAL
 *
 * Exits 0 always — non-critical step, never blocks the pipeline.
 *
 * CLI flags:
 *   --dry-run          Log what would change, make no writes
 *   --ticker XYZ       Process a single ticker only
 *   --force            Bypass 24-hour cooldown
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

const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

// Urgency threshold (days since last_updated on any hypothesis)
const STALE_DAYS = 7;   // ≥7 days without update → MODERATE urgency trigger

const MODELS = {
  evidence:  'claude-haiku-4-5-20251001',
  narrative: 'claude-sonnet-4-6',
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

  // 24-hour cooldown check
  if (!FORCE && stock.last_llm_refresh) {
    const lastRefresh = new Date(stock.last_llm_refresh).getTime();
    const elapsed = now - lastRefresh;
    if (elapsed < COOLDOWN_MS) {
      const hoursLeft = ((COOLDOWN_MS - elapsed) / 3600000).toFixed(1);
      return { shouldRun: false, reasons: [`cooldown (${hoursLeft}h remaining)`], hasNewAnnouncements: false, needsNarrativeRefresh: false };
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
  const naResult = narrativeAnalysis.results && narrativeAnalysis.results[ticker];
  if (naResult && naResult.dislocation) {
    const sev = naResult.dislocation.severity;
    if (sev === 'CRITICAL' || sev === 'HIGH') {
      needsNarrativeRefresh = true;
      reasons.push(`dislocation severity ${sev}`);
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
      // No last_updated at all — always refresh
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

Extract ONE evidence item from the most diagnostically significant announcement above.

Respond with ONLY a JSON object matching this exact schema — no markdown, no explanation:
{
  "id": "string (TICKER_DESCRIPTOR in SCREAMING_SNAKE_CASE, e.g. ${ticker}_Q3_SALES_UPDATE)",
  "type": "one of: EARNINGS_REPORT | MANAGEMENT_GUIDANCE | OPERATIONAL_DATA | INDUSTRY_DATA | REGULATORY | CAPITAL_MARKETS | ANALYST_NOTE | MACRO",
  "source": "brief source name (e.g. ASX Filing, Company Presentation, Media Report)",
  "epistemic_tag": "one of: Under Oath (statutory) | Independent (third-party) | Motivated (corporate) | Speculative (media) | Proprietary (internal)",
  "date": "ISO 8601 date string",
  "summary": "1-2 sentence factual summary of what was announced",
  "diagnosticity": "one of: VERY_HIGH | HIGH | MEDIUM | LOW | VERY_LOW",
  "hypothesis_impact": {
    "T1": "one of: CONSISTENT | INCONSISTENT | NEUTRAL",
    "T2": "one of: CONSISTENT | INCONSISTENT | NEUTRAL",
    "T3": "one of: CONSISTENT | INCONSISTENT | NEUTRAL",
    "T4": "one of: CONSISTENT | INCONSISTENT | NEUTRAL"
  },
  "decay": {
    "full_weight_days": 90,
    "half_life_days": 90
  },
  "active": true
}`;
}

function buildNarrativePrompt(stock, ticker, naResult, priceData) {
  const hypotheses = Object.entries(stock.hypotheses || {})
    .map(([tier, h]) => {
      return `${tier} "${h.label}" (survival: ${h.survival_score}, status: ${h.status}):
  - Description: ${h.description}
  - Current plain_english: ${h.plain_english || 'none'}
  - Current what_to_watch: ${h.what_to_watch || 'none'}`;
    }).join('\n\n');

  const recentEvidence = (stock.evidence_items || []).slice(0, 5)
    .map(e => `- [${e.epistemic_tag}] ${e.date ? e.date.substring(0, 10) : ''}: ${e.summary}`)
    .join('\n');

  const dislocInfo = naResult && naResult.dislocation
    ? `Dislocation: ${naResult.dislocation.severity} | Pattern: ${naResult.dislocation.pattern || 'unknown'} | Price: $${naResult.dislocation.metrics?.currentPrice ?? 'N/A'} | DrawdownFromPeak: ${naResult.dislocation.metrics?.drawdownFromPeak ?? 'N/A'}%`
    : 'Dislocation: unknown';

  const priceInfo = priceData
    ? `Current price: $${priceData.price ?? 'N/A'} | Change: ${priceData.changePercent ?? 'N/A'}%`
    : '';

  return `You are an equity research analyst refreshing narrative commentary for ${stock.company || ticker} (ASX: ${ticker}).

MARKET CONTEXT:
${dislocInfo}
${priceInfo}
Big picture: ${stock.big_picture || 'none'}

HYPOTHESES (do NOT change survival_score, status, label, or description):
${hypotheses}

RECENT EVIDENCE (for context only):
${recentEvidence}

TASK: Refresh the written commentary to reflect the current market environment. Write in plain English suitable for a sophisticated investor, not technical jargon.

Respond with ONLY a JSON object — no markdown, no explanation:
{
  "big_picture": "2-3 sentence update to the company's big picture context (current dynamics, what's changed)",
  "hypotheses": {
    "T1": {
      "plain_english": "2-3 sentences explaining what T1 means in plain English given current evidence",
      "what_to_watch": "1-2 sentences: the specific data points or catalysts that would strengthen or weaken this hypothesis"
    },
    "T2": {
      "plain_english": "...",
      "what_to_watch": "..."
    },
    "T3": {
      "plain_english": "...",
      "what_to_watch": "..."
    },
    "T4": {
      "plain_english": "...",
      "what_to_watch": "..."
    }
  }
}`;
}

// ---------------------------------------------------------------------------
// Claude API wrapper
// ---------------------------------------------------------------------------

async function callClaude(client, model, prompt, ticker, mode) {
  try {
    const message = await client.messages.create({
      model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

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
  for (const tier of ['T1', 'T2', 'T3', 'T4']) {
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

function applyNarrativeRefresh(stock, updates) {
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

    // --- Evidence extraction (Haiku) ---
    if (hasNewAnnouncements) {
      const lastRefresh = stock.last_llm_refresh ? new Date(stock.last_llm_refresh).getTime() : 0;
      const newAnns = tickerAnnouncements.filter(a => {
        const annDate = new Date(a.date || a.datetime || 0).getTime();
        return annDate > lastRefresh;
      });

      log(`[${ticker}] extracting evidence from ${newAnns.length} announcement(s) via Haiku`);

      if (!DRY_RUN) {
        const evidenceItem = await callClaude(client, MODELS.evidence, buildEvidencePrompt(stock, ticker, newAnns), ticker, 'evidence');
        if (evidenceItem && validateEvidenceItem(evidenceItem, ticker)) {
          const applied = applyEvidenceItem(stock, evidenceItem);
          if (applied) {
            log(`[${ticker}] evidence item added: ${evidenceItem.id}`);
            stockChanged = true;
          } else {
            log(`[${ticker}] evidence item skipped (duplicate id: ${evidenceItem.id})`);
          }
        }
      } else {
        log(`[${ticker}] DRY RUN: would call Haiku for evidence extraction`);
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
            log(`[${ticker}] narrative refreshed`);
            stockChanged = true;
          }
        }
      } else {
        log(`[${ticker}] DRY RUN: would call Sonnet for narrative refresh`);
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
