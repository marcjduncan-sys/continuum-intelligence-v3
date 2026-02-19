#!/usr/bin/env node
/**
 * calc-overcorrection.js
 *
 * Continuum Intelligence — Phase 4: Overcorrection Detection
 * Per MASTER_IMPLEMENTATION_INSTRUCTIONS.md §Phase 4
 *
 * Runs daily after price-evidence-engine. Two duties:
 *
 *   A. TRIGGER — Detect new overcorrections from today's price move:
 *      §4.1  Single-day move >10% OR 5-day cumulative >15%
 *      §4.2  Generate AMBER evidence item; set _overcorrection.active = true
 *
 *   B. REVIEW — Evaluate active overcorrections past their reviewDate:
 *      §4.3  >50% reversed  → CONFIRMED overcorrection
 *             25-50% reversed → INCONCLUSIVE — extend review 5 more trading days
 *             <25% reversed  → FUNDAMENTAL move — clear flag, add +3 to aligned hypotheses
 *
 *   C. DISPLAY — §4.4 Write amber banner payload to stock JSON for frontend
 *
 * Usage:
 *   node scripts/calc-overcorrection.js [--dry-run] [--verbose] [--date YYYY-MM-DD]
 *
 * Reads:
 *   data/live-prices.json          — today's price and prev-close
 *   data/stocks/{T}.json           — stock config, _overcorrection state, hypotheses
 *   data/stocks/{T}-history.json   — price history for cumulative move calculation
 *
 * Writes:
 *   data/stocks/{T}.json           — updated _overcorrection, alert_state, evidence_items,
 *                                    overcorrection_banner, hypothesis survival_scores (if +3)
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT             = path.join(__dirname, '..');
const TICKERS_PATH     = path.join(ROOT, 'data', 'config', 'tickers.json');
const STOCKS_DIR       = path.join(ROOT, 'data', 'stocks');
const LIVE_PRICES_PATH = path.join(ROOT, 'data', 'live-prices.json');

const args    = process.argv.slice(2);
const dryRun  = args.includes('--dry-run');
const verbose = args.includes('--verbose');
const dateIdx = args.indexOf('--date');
const today   = (dateIdx !== -1 && args[dateIdx + 1]) ? args[dateIdx + 1]
              : new Date().toISOString().split('T')[0];

// ── Trading-day arithmetic ────────────────────────────────────────────────────

function addTradingDays(fromDateStr, n) {
  const d = new Date(fromDateStr + 'T00:00:00Z');
  let added = 0;
  while (added < n) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d.toISOString().split('T')[0];
}

// ── §4.1: Detect overcorrection triggers ────────────────────────────────────

function checkTrigger(dailyChangePct, fiveDayCumPct) {
  const absDailyPct = Math.abs(dailyChangePct);
  const abs5d       = Math.abs(fiveDayCumPct || 0);

  if (absDailyPct > 10) {
    return {
      triggered:   true,
      triggerType: 'SINGLE_DAY',
      movePct:     dailyChangePct,
      message:     `Single-day move of ${dailyChangePct > 0 ? '+' : ''}${dailyChangePct.toFixed(1)}% exceeds 10% threshold`
    };
  }
  if (abs5d > 15) {
    return {
      triggered:   true,
      triggerType: 'FIVE_DAY_CUMULATIVE',
      movePct:     fiveDayCumPct,
      message:     `5-day cumulative move of ${fiveDayCumPct > 0 ? '+' : ''}${fiveDayCumPct.toFixed(1)}% exceeds 15% threshold`
    };
  }
  return { triggered: false };
}

// ── §4.3: 5-day review logic ─────────────────────────────────────────────────
//   > 50% reversed  → CONFIRMED overcorrection
//   25-50% reversed → INCONCLUSIVE — extend 5 trading days
//   < 25% reversed  → FUNDAMENTAL — clear, +3 to aligned hypotheses

function evaluateReview(oc, currentPrice) {
  // triggerPrice = price AT time of trigger (i.e. AFTER the day's move)
  // movePct      = the % daily change that caused the trigger (e.g. -12 for a 12% drop)
  //
  // Reconstruct the pre-move price:
  //   preMovePrice = triggerPrice / (1 + movePct/100)
  // Original move size in absolute price terms:
  //   originalMoveSize = |preMovePrice - triggerPrice|
  // Recovery fraction:
  //   For a DOWN move: reversal = (currentPrice - triggerPrice) / originalMoveSize
  //   For an UP move:  reversal = (triggerPrice - currentPrice) / originalMoveSize
  const triggerPrice    = oc.triggerPrice;
  const movePct         = oc.movePct || 0;
  const preMovePrice    = movePct !== -100 ? triggerPrice / (1 + movePct / 100) : triggerPrice;
  const originalMoveSize = Math.abs(preMovePrice - triggerPrice);
  const priceSince      = currentPrice - triggerPrice;
  // Positive reversalPct = price moving back toward pre-move level (recovery)
  const reversalPct = originalMoveSize > 0
    ? (oc.direction === 'down' ? priceSince : -priceSince) / originalMoveSize * 100
    : 0;
  const absReversal = Math.abs(reversalPct);

  if (absReversal > 50) {
    return {
      outcome:      'CONFIRMED',
      reversalPct:  Math.round(reversalPct * 10) / 10,
      message:      `Overcorrection CONFIRMED — ${absReversal.toFixed(0)}% of move reversed within 5 trading days`,
      extend:       false,
      fundamental:  false
    };
  }
  if (absReversal >= 25) {
    return {
      outcome:      'INCONCLUSIVE',
      reversalPct:  Math.round(reversalPct * 10) / 10,
      message:      `Overcorrection INCONCLUSIVE — ${absReversal.toFixed(0)}% reversed; extending review 5 more trading days`,
      extend:       true,
      fundamental:  false
    };
  }
  return {
    outcome:     'FUNDAMENTAL',
    reversalPct: Math.round(reversalPct * 10) / 10,
    message:     `Move appears FUNDAMENTAL — only ${absReversal.toFixed(0)}% reversed; adding weight to aligned hypotheses`,
    extend:      false,
    fundamental: true
  };
}

// ── §4.4: Build amber banner payload for display layer ───────────────────────

function buildBanner(oc, ticker) {
  if (!oc || !oc.active) return null;
  const dir  = oc.direction === 'up' ? 'rise' : 'drop';
  const sign = oc.movePct > 0 ? '+' : '';
  return {
    active:     true,
    severity:   'AMBER',
    triggerType: oc.triggerType,
    triggerDate: oc.triggerDate,
    reviewDate:  oc.reviewDate,
    movePct:     oc.movePct,
    message:     `Potential overcorrection detected — ${sign}${oc.movePct.toFixed(1)}% ${dir} may exceed fundamental impact. Monitoring for mean reversion until ${oc.reviewDate}.`,
    shortMsg:    `${sign}${oc.movePct.toFixed(1)}% ${dir} — overcorrection watch`
  };
}

// ── Apply +3 to hypotheses aligned with the move direction (fundamental case) ─

function applyFundamentalBoost(hypotheses, moveDirection) {
  // moveDirection: +1 = bullish move, -1 = bearish move
  // Boost hypotheses ALIGNED with the move (BULLISH for up, BEARISH for down)
  const alignedSentiment = moveDirection > 0 ? 'BULLISH' : 'BEARISH';
  return hypotheses.map(h => {
    if ((h.sentiment || '').toUpperCase() === alignedSentiment) {
      return { ...h, survival_score: Math.min(80, (h.survival_score || 0) + 3) };
    }
    return h;
  });
}

// ── Compute 5-day cumulative move from history ────────────────────────────────
// Excludes reconstructed entries — backfilled prices may be synthetic and
// would produce spurious cumulative moves (e.g. RIO showing +44% 5d)

function computeFiveDayCumulative(history, currentPrice) {
  const realEntries = history
    .filter(e => e.date < today && e.price && !e.reconstructed);
  if (realEntries.length < 5) return null;  // Not enough real price data
  const prices = realEntries.map(e => e.price).filter(p => p > 0);
  if (prices.length < 5) return null;
  const p5 = prices[prices.length - 5];
  return p5 > 0 ? ((currentPrice - p5) / p5) * 100 : null;
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  console.log('');
  console.log('══════════════════════════════════════════════════════════════');
  console.log('  CONTINUUM INTELLIGENCE — Phase 4: Overcorrection Detection');
  console.log('══════════════════════════════════════════════════════════════');
  console.log('  Date:', today, '| Mode:', dryRun ? 'DRY RUN' : 'LIVE');

  const tickerConfig = JSON.parse(fs.readFileSync(TICKERS_PATH, 'utf8'));
  const tickers = Object.keys(tickerConfig.tickers)
    .filter(t => tickerConfig.tickers[t].status === 'active');
  console.log('  Active tickers:', tickers.length);

  // Load live prices — file is { updated, market, count, prices: { WOW: {...}, ... } }
  let prices = {};
  try {
    const raw = JSON.parse(fs.readFileSync(LIVE_PRICES_PATH, 'utf8'));
    // Handle both shapes: direct { ticker: {p,pc,...} } and nested { prices: {...} }
    prices = (raw && raw.prices && typeof raw.prices === 'object') ? raw.prices : raw;
  } catch (e) {
    console.warn('  [WARN] Cannot read live-prices.json:', e.message);
  }

  let triggered = 0, reviewed = 0, cleared = 0, extended = 0, confirmed = 0;

  for (const ticker of tickers) {
    const stockPath   = path.join(STOCKS_DIR, ticker + '.json');
    const historyPath = path.join(STOCKS_DIR, ticker + '-history.json');

    if (!fs.existsSync(stockPath)) continue;

    let stockData, historyData;
    try {
      stockData   = JSON.parse(fs.readFileSync(stockPath,   'utf8'));
      historyData = fs.existsSync(historyPath)
        ? JSON.parse(fs.readFileSync(historyPath, 'utf8'))
        : { history: [] };
    } catch (e) {
      console.warn('  [WARN]', ticker, ':', e.message);
      continue;
    }

    const history      = historyData.history || [];
    const priceEntry   = prices[ticker] || {};
    const currentPrice = priceEntry.p  || stockData.current_price || 0;
    const prevClose    = priceEntry.pc || 0;

    if (currentPrice === 0) continue;

    // ── A. TRIGGER CHECK ─────────────────────────────────────────────────────
    // Only trigger if not already active (don't double-trigger)
    const existingOC = stockData._overcorrection;
    const alreadyActive = existingOC && existingOC.active;

    if (!alreadyActive && currentPrice > 0 && prevClose > 0) {
      const dailyChangePct = ((currentPrice - prevClose) / prevClose) * 100;
      const fiveDayCum     = computeFiveDayCumulative(history, currentPrice);
      const trigger        = checkTrigger(dailyChangePct, fiveDayCum);

      if (trigger.triggered) {
        const reviewDate = addTradingDays(today, 5);

        stockData._overcorrection = {
          active:       true,
          triggerType:  trigger.triggerType,
          triggerDate:  today,
          triggerPrice: currentPrice,
          direction:    dailyChangePct > 0 ? 'up' : 'down',
          movePct:      Math.round(dailyChangePct * 100) / 100,
          reviewDate,
          extensionCount: 0,
          message:      trigger.message
        };
        stockData.alert_state = 'OVERCORRECTION';

        // §4.2: Amber evidence item
        if (!stockData.evidence_items) stockData.evidence_items = [];
        stockData.evidence_items.push({
          date:           today,
          type:           'OVERCORRECTION_TRIGGER',
          severity:       'AMBER',
          source:         'PRICE',
          diagnosticity:  'MEDIUM',
          description:    `${trigger.message} — potential overcorrection. Monitoring for mean reversion until ${reviewDate}.`,
          auto_generated: true
        });

        // §4.4: Amber banner
        stockData.overcorrection_banner = buildBanner(stockData._overcorrection, ticker);

        triggered++;
        const sign = dailyChangePct > 0 ? '+' : '';
        console.log('  ⚠ TRIGGER', ticker.padEnd(6),
          `${sign}${dailyChangePct.toFixed(1)}% [${trigger.triggerType}] → review ${reviewDate}`);
      }
    }

    // ── B. REVIEW CHECK ──────────────────────────────────────────────────────
    // Run review if overcorrection is active and reviewDate has passed
    const oc = stockData._overcorrection;
    if (oc && oc.active && today >= oc.reviewDate) {
      reviewed++;
      const review = evaluateReview(oc, currentPrice);

      if (verbose) {
        console.log('  📋 REVIEW', ticker.padEnd(6),
          `${review.outcome} | reversal: ${review.reversalPct}%`);
      }

      // Add evidence item for review result
      if (!stockData.evidence_items) stockData.evidence_items = [];
      stockData.evidence_items.push({
        date:           today,
        type:           'OVERCORRECTION_REVIEW',
        severity:       review.outcome === 'CONFIRMED' ? 'GREEN'
                      : review.outcome === 'FUNDAMENTAL' ? 'RED'
                      : 'AMBER',
        source:         'PRICE',
        diagnosticity:  'HIGH',
        description:    review.message,
        auto_generated: true,
        reversal_pct:   review.reversalPct,
        outcome:        review.outcome
      });

      if (review.outcome === 'CONFIRMED') {
        // Overcorrection confirmed — price self-corrected; clear flag
        stockData._overcorrection = { ...oc, active: false, resolvedDate: today,
          resolvedOutcome: 'CONFIRMED', reversalPct: review.reversalPct };
        stockData.alert_state          = 'NORMAL';
        stockData.overcorrection_banner = null;
        confirmed++;
        console.log('  ✅ CONFIRMED', ticker.padEnd(6),
          `overcorrection — ${Math.abs(review.reversalPct)}% reversed`);

      } else if (review.outcome === 'INCONCLUSIVE') {
        // Extend review by 5 more trading days
        const newReviewDate = addTradingDays(today, 5);
        const extCount      = (oc.extensionCount || 0) + 1;
        stockData._overcorrection = { ...oc, reviewDate: newReviewDate,
          extensionCount: extCount, lastReviewDate: today,
          lastReviewOutcome: 'INCONCLUSIVE' };
        stockData.overcorrection_banner = buildBanner(stockData._overcorrection, ticker);
        extended++;
        console.log('  ⏳ EXTENDED', ticker.padEnd(6),
          `review to ${newReviewDate} (extension #${extCount})`);

      } else {
        // FUNDAMENTAL — clear flag, add +3 to aligned hypotheses
        const moveDirection = oc.direction === 'up' ? 1 : -1;

        // Update hypotheses in stock JSON (keyed object, decimal scores)
        if (stockData.hypotheses) {
          for (const [tier, h] of Object.entries(stockData.hypotheses)) {
            // Infer sentiment from keyed object structure
            // Aligned = same direction as original move
            const sentiment = (h.sentiment || h.label || '').toUpperCase();
            const isAligned = moveDirection > 0
              ? sentiment.includes('BULLISH') || sentiment.includes('GROWTH') || sentiment.includes('UPSIDE')
              : sentiment.includes('BEARISH') || sentiment.includes('RISK') || sentiment.includes('DOWNSIDE');
            if (isAligned) {
              h.survival_score = Math.min(0.80, (h.survival_score || 0) + 0.03);
              h.fundamental_boost_applied = today;
            }
          }
        }

        // Also update history entry hypotheses
        const todayEntry = history.find(e => e.date === today);
        if (todayEntry && (todayEntry.hypotheses || []).length > 0) {
          const alignedSentiment = moveDirection > 0 ? 'BULLISH' : 'BEARISH';
          todayEntry.hypotheses = todayEntry.hypotheses.map(h => {
            if ((h.sentiment || '').toUpperCase() === alignedSentiment) {
              return { ...h, survival_score: Math.min(80, (h.survival_score || 0) + 3) };
            }
            return h;
          });
        }

        stockData._overcorrection = { ...oc, active: false, resolvedDate: today,
          resolvedOutcome: 'FUNDAMENTAL', reversalPct: review.reversalPct };
        stockData.alert_state          = 'NORMAL';
        stockData.overcorrection_banner = null;
        cleared++;
        console.log('  📌 FUNDAMENTAL', ticker.padEnd(6),
          `move confirmed — +3 to aligned hypotheses, flag cleared`);
      }
    }

    // Ensure banner is cleared if not active
    if (!stockData._overcorrection || !stockData._overcorrection.active) {
      if (stockData.overcorrection_banner && stockData.overcorrection_banner.active) {
        stockData.overcorrection_banner = null;
      }
    }

    // ── Write ────────────────────────────────────────────────────────────────
    if (!dryRun) {
      fs.writeFileSync(stockPath, JSON.stringify(stockData, null, 2), 'utf8');
      if (fs.existsSync(historyPath)) {
        fs.writeFileSync(historyPath, JSON.stringify(historyData, null, 2), 'utf8');
      }
    }
  }

  console.log('');
  console.log('  ── Summary ──');
  console.log('  Triggered:', triggered, '| Reviewed:', reviewed);
  console.log('  Confirmed:', confirmed, '| Extended:', extended, '| Fundamental:', cleared);
  if (dryRun) console.log('  (DRY RUN — no files written)');
  console.log('══════════════════════════════════════════════════════════════');
}

if (require.main === module) {
  main();
}

module.exports = { checkTrigger, evaluateReview, buildBanner, addTradingDays };
