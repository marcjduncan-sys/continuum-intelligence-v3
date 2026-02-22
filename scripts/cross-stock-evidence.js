#!/usr/bin/env node
/**
 * cross-stock-evidence.js
 *
 * Continuum Intelligence — Cross-Stock Evidence Propagation
 *
 * When BHP reports iron ore shipment data, that is evidence for FMG, RIO, and MIN.
 * When CBA reports mortgage arrears, that is evidence for NAB and other banks.
 *
 * This module defines sector peer groups and propagates diagnostically relevant
 * evidence items across peer stocks, with appropriate attenuation.
 *
 * Runs after refresh-content.js in the pipeline. Reads evidence_items from each
 * stock JSON, identifies cross-stock relevance, and writes propagated items.
 *
 * Usage:
 *   node scripts/cross-stock-evidence.js [--dry-run] [--verbose]
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const DATA_DIR   = path.join(__dirname, '..', 'data');
const STOCKS_DIR = path.join(DATA_DIR, 'stocks');
const { getActiveTickers, loadRegistry } = require('./lib/registry');

const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose');

// ---------------------------------------------------------------------------
// Sector peer groups — evidence propagates within these groups
// ---------------------------------------------------------------------------

const PEER_GROUPS = {
  IRON_ORE: {
    tickers: ['BHP', 'FMG', 'RIO'],
    relevantTypes: ['EARNINGS_REPORT', 'OPERATIONAL_DATA', 'INDUSTRY_DATA', 'MACRO'],
    attenuation: 0.6,  // Propagated evidence carries 60% weight of original
    description: 'Iron ore miners — shared commodity exposure'
  },
  BANKS: {
    tickers: ['CBA', 'NAB', 'MQG'],
    relevantTypes: ['EARNINGS_REPORT', 'REGULATORY', 'MACRO', 'INDUSTRY_DATA'],
    attenuation: 0.5,
    description: 'Australian financials — shared credit cycle and rate exposure'
  },
  ASX_TECH: {
    tickers: ['XRO', 'WTC', 'PME', 'OCL'],
    relevantTypes: ['INDUSTRY_DATA', 'MACRO', 'CAPITAL_MARKETS'],
    attenuation: 0.4,  // Tech stocks are more idiosyncratic
    description: 'ASX technology — shared multiple/sentiment exposure'
  },
  HEALTHCARE: {
    tickers: ['CSL', 'PME', 'SIG'],
    relevantTypes: ['REGULATORY', 'INDUSTRY_DATA', 'MACRO'],
    attenuation: 0.35,
    description: 'Healthcare — shared regulatory and sector sentiment'
  },
  DEFENCE: {
    tickers: ['DRO', 'ASB'],
    relevantTypes: ['REGULATORY', 'INDUSTRY_DATA', 'CAPITAL_MARKETS', 'MACRO'],
    attenuation: 0.55,
    description: 'Defence — shared budget cycle and geopolitical exposure'
  },
  REAL_ESTATE: {
    tickers: ['GMG', 'DXS'],
    relevantTypes: ['MACRO', 'INDUSTRY_DATA', 'REGULATORY'],
    attenuation: 0.45,
    description: 'REITs — shared rate sensitivity and property cycle'
  },
  ENERGY: {
    tickers: ['WDS', 'WOR'],
    relevantTypes: ['INDUSTRY_DATA', 'MACRO', 'REGULATORY', 'OPERATIONAL_DATA'],
    attenuation: 0.5,
    description: 'Energy — shared commodity and transition exposure'
  },
};

// ---------------------------------------------------------------------------
// Build peer lookup: ticker -> list of { peerTicker, group, attenuation, relevantTypes }
// ---------------------------------------------------------------------------

function buildPeerMap() {
  const peerMap = {};
  for (const [groupName, group] of Object.entries(PEER_GROUPS)) {
    for (const ticker of group.tickers) {
      if (!peerMap[ticker]) peerMap[ticker] = [];
      for (const peer of group.tickers) {
        if (peer !== ticker) {
          peerMap[ticker].push({
            peerTicker: peer,
            group: groupName,
            attenuation: group.attenuation,
            relevantTypes: new Set(group.relevantTypes),
          });
        }
      }
    }
  }
  return peerMap;
}

// ---------------------------------------------------------------------------
// Propagation logic
// ---------------------------------------------------------------------------

function propagateEvidence(sourceStock, sourceTicker, targetStock, targetTicker, peerConfig) {
  const sourceEvidence = sourceStock.evidence_items || [];
  const targetEvidence = targetStock.evidence_items || [];
  const existingIds = new Set(targetEvidence.map(e => e.id));

  let propagated = 0;

  for (const item of sourceEvidence) {
    // Only propagate relevant evidence types
    if (!peerConfig.relevantTypes.has(item.type)) continue;

    // Only propagate HIGH or VERY_HIGH diagnosticity items (low diagnosticity = noise)
    if (item.diagnosticity !== 'VERY_HIGH' && item.diagnosticity !== 'HIGH') continue;

    // Only propagate active items
    if (!item.active) continue;

    // Only propagate recent items (< 30 days old)
    const daysSince = (Date.now() - new Date(item.date || 0).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince > 30) continue;

    // Build propagated ID to avoid duplicates
    const propagatedId = `${targetTicker}_VIA_${sourceTicker}_${item.id}`;
    if (existingIds.has(propagatedId)) continue;

    // Create propagated evidence item with attenuation
    const propagatedItem = {
      id: propagatedId,
      type: item.type,
      source: `${item.source} (via ${sourceTicker} — ${peerConfig.group} peer)`,
      epistemic_tag: item.epistemic_tag,
      date: item.date,
      summary: `[Cross-stock: ${sourceTicker}] ${item.summary}`,
      diagnosticity: attenuateDiagnosticity(item.diagnosticity, peerConfig.attenuation),
      hypothesis_impact: inferCrossStockImpact(item, sourceStock, targetStock),
      decay: {
        full_weight_days: Math.round((item.decay?.full_weight_days || 90) * 0.5), // Faster decay for propagated
        half_life_days: Math.round((item.decay?.half_life_days || 90) * 0.5),
      },
      active: true,
      propagated: true,
      source_ticker: sourceTicker,
      attenuation: peerConfig.attenuation,
    };

    targetStock.evidence_items = [propagatedItem, ...(targetStock.evidence_items || [])];
    existingIds.add(propagatedId);
    propagated++;
  }

  return propagated;
}

function attenuateDiagnosticity(original, attenuation) {
  // Cross-stock evidence is inherently less diagnostic for the target
  if (attenuation >= 0.6) return original === 'VERY_HIGH' ? 'HIGH' : 'MEDIUM';
  if (attenuation >= 0.4) return original === 'VERY_HIGH' ? 'MEDIUM' : 'LOW';
  return 'LOW';
}

function inferCrossStockImpact(item, sourceStock, targetStock) {
  // For cross-stock evidence, we can only infer impact at the macro/sector level
  // Map based on evidence type and direction
  const impact = {};
  const tiers = Object.keys(targetStock.hypotheses || {});

  for (const tier of tiers) {
    const hyp = targetStock.hypotheses[tier];
    const label = (hyp.label || '').toLowerCase();

    // Industry/macro evidence affects hypotheses based on their nature
    if (item.type === 'MACRO' || item.type === 'INDUSTRY_DATA' || item.type === 'REGULATORY') {
      // Check if source evidence was broadly positive or negative
      const sourceImpacts = Object.values(item.hypothesis_impact || {});
      const consistentCount = sourceImpacts.filter(i => i === 'CONSISTENT').length;
      const inconsistentCount = sourceImpacts.filter(i => i === 'INCONSISTENT').length;

      if (consistentCount > inconsistentCount) {
        // Broadly positive evidence from peer
        if (label.includes('growth') || label.includes('expansion') || label.includes('recovery') || label.includes('upside')) {
          impact[tier] = 'CONSISTENT';
        } else if (label.includes('risk') || label.includes('decline') || label.includes('compression') || label.includes('downside')) {
          impact[tier] = 'INCONSISTENT';
        } else {
          impact[tier] = 'NEUTRAL';
        }
      } else if (inconsistentCount > consistentCount) {
        // Broadly negative evidence from peer
        if (label.includes('risk') || label.includes('decline') || label.includes('compression') || label.includes('downside')) {
          impact[tier] = 'CONSISTENT';
        } else if (label.includes('growth') || label.includes('expansion') || label.includes('recovery') || label.includes('upside')) {
          impact[tier] = 'INCONSISTENT';
        } else {
          impact[tier] = 'NEUTRAL';
        }
      } else {
        impact[tier] = 'NEUTRAL';
      }
    } else {
      // Company-specific evidence from peers is mostly neutral for the target
      impact[tier] = 'NEUTRAL';
    }
  }

  return impact;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log('[cross-stock-evidence] Starting cross-stock evidence propagation');
  if (DRY_RUN) console.log('[cross-stock-evidence] DRY RUN — no files will be written');

  const peerMap = buildPeerMap();
  const activeTickers = getActiveTickers();
  let totalPropagated = 0;

  // Load all stock data
  const stockData = {};
  for (const ticker of activeTickers) {
    const filePath = path.join(STOCKS_DIR, `${ticker}.json`);
    try {
      stockData[ticker] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
      if (VERBOSE) console.warn(`[cross-stock-evidence] Cannot read ${ticker}.json`);
    }
  }

  // Propagate evidence
  for (const [ticker, peers] of Object.entries(peerMap)) {
    if (!stockData[ticker]) continue;

    for (const peer of peers) {
      if (!stockData[peer.peerTicker]) continue;

      const count = propagateEvidence(
        stockData[peer.peerTicker], peer.peerTicker,
        stockData[ticker], ticker,
        peer
      );

      if (count > 0) {
        console.log(`[cross-stock-evidence] ${peer.peerTicker} -> ${ticker}: ${count} item(s) propagated (${peer.group})`);
        totalPropagated += count;
      }
    }
  }

  // Write back
  if (!DRY_RUN) {
    for (const [ticker, stock] of Object.entries(stockData)) {
      const filePath = path.join(STOCKS_DIR, `${ticker}.json`);
      fs.writeFileSync(filePath, JSON.stringify(stock, null, 2), 'utf8');
    }
  }

  console.log(`[cross-stock-evidence] Done. ${totalPropagated} evidence item(s) propagated across ${Object.keys(peerMap).length} stocks.`);
}

if (require.main === module) {
  main();
}

module.exports = { PEER_GROUPS, buildPeerMap, propagateEvidence };
