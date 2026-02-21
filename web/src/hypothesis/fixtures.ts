import type { StockModel } from "./types";

// ── BHP_FIXTURE ────────────────────────────────────────────────────────────────
// 4 hypotheses  p = [0.34, 0.30, 0.21, 0.15]  all p_prior = null
// constructive = T1 + T2  downside = T3 + T4
// Computed: Contested, CONTESTED LEAD tension, skewScore=64, "Leaning Constructive"

export const BHP_FIXTURE: StockModel = {
  stock: {
    name: "BHP Group",
    ticker: "BHP.AX",
    exchange: "ASX",
    sector: "Materials",
    asOf: "2026-02-16",
    price: "A$53.33",
    currency: "AUD",
  },
  hypotheses: [
    {
      code: "T1", name: "Copper Supercycle", stance: "BULLISH", p: 0.34, p_prior: null,
      short: "Copper transition drives growth; electrification tightens supply.",
      requires: ["Copper > US$4.00/lb", "Escondida debottlenecking delivers", "OZ Minerals integration on track"],
      supportingEvidence: ["e1", "e2", "e7"], contradictingEvidence: [],
    },
    {
      code: "T2", name: "Iron Ore Cash Machine", stance: "NEUTRAL", p: 0.30, p_prior: null,
      short: "WAIO cost leadership sustains dividend floor and buybacks.",
      requires: ["Iron ore > US$100/t", "China infrastructure offsets property weakness"],
      supportingEvidence: ["e1", "e4"], contradictingEvidence: ["e3", "e5"],
    },
    {
      code: "T3", name: "China Property Drag", stance: "BEARISH", p: 0.21, p_prior: null,
      short: "China steel/property weakness compresses iron ore margins.",
      requires: ["China steel production declines > 5%", "Iron ore falls below US$90/t"],
      supportingEvidence: ["e3", "e5"], contradictingEvidence: ["e1"],
    },
    {
      code: "T4", name: "Commodity Cycle Peak", stance: "BEARISH", p: 0.15, p_prior: null,
      short: "Broad commodity downturn plus execution/capex risk hits earnings.",
      requires: ["Global recession", "Multiple commodity prices fall simultaneously"],
      supportingEvidence: ["e3", "e5", "e6"], contradictingEvidence: ["e1", "e2", "e4"],
    },
  ],
  constructiveCodes: ["T1", "T2"],
  downsideCodes: ["T3", "T4"],
  tripwires: [
    {
      id: "tw1", timeframe: "FEB 2026", title: "H1 FY26 Results \u2013 Copper vs Iron Test",
      condition_good: "Copper production exceeds guidance AND iron ore margins stable",
      effect_good: "T1 strengthens; transition thesis validated by delivery",
      condition_bad: "Realised iron ore price < US$95/t OR copper volumes disappoint",
      effect_bad: "T3 strengthens; market reprices toward iron ore vulnerability",
      cadence: "Event-driven (results day)", source: "BHP ASX announcement",
      currentReading: null, proximity: null,
    },
    {
      id: "tw2", timeframe: "LATE CY2026", title: "Jansen Potash \u2013 First Production",
      condition_good: "First saleable tonnes on schedule (late CY2026)",
      effect_good: "Diversification thesis validated; potash hedge becomes real",
      condition_bad: "Delay beyond Q1 2027 OR capex overrun >15%",
      effect_bad: "T4 strengthens via capital allocation / execution risk",
      cadence: "Quarterly production reports", source: "BHP quarterly updates",
      currentReading: null, proximity: null,
    },
    {
      id: "tw3", timeframe: "ONGOING", title: "Iron Ore Price Floor Watch",
      condition_good: "Iron ore sustains > US$100/t through CY2026",
      effect_good: "T2 confirmed; dividend/buyback capacity secure",
      condition_bad: "Iron ore < US$85/t for > 1 quarter",
      effect_bad: "T3 crystallises; demand decline structural; dividend reset risk",
      cadence: "Weekly (SGX/Platts)", source: "SGX futures; Platts IODEX",
      currentReading: null, proximity: null,
    },
  ],
  evidence: [
    { id: "e1", title: "H1 FY26 financials: EBITDA ~US$27B; net debt ~US$12B within target", domain: "Regulatory", quality: "HIGH", date: "2026-02-16", dir: { T1: 1, T2: 1, T3: -1, T4: -1 }, contribution: { T1: 0.12, T2: 0.18, T3: -0.10, T4: -0.14 }, source: "BHP H1 FY26 ASX filing", freshness: "Current" },
    { id: "e2", title: "Copper supply gap forecast (10+ Mt by 2035) \u2013 peer-reviewed", domain: "Academic", quality: "HIGH", date: "2025-10-01", dir: { T1: 1, T2: 0, T3: 0, T4: -1 }, contribution: { T1: 0.22, T2: 0.0, T3: 0.0, T4: -0.18 }, source: "Nature Reviews, Oct 2025", freshness: "Recent" },
    { id: "e3", title: "China housing starts materially down from peak; property investment declining", domain: "Economic", quality: "HIGH", date: "2026-01-31", dir: { T1: 0, T2: -1, T3: 1, T4: 1 }, contribution: { T1: 0.0, T2: -0.16, T3: 0.20, T4: 0.10 }, source: "NBS China, Jan 2026", freshness: "Current" },
    { id: "e4", title: "WAIO C1 costs US$15\u201317/t (first quartile globally)", domain: "Regulatory", quality: "HIGH", date: "2026-02-16", dir: { T1: 0, T2: 1, T3: 0, T4: -1 }, contribution: { T1: 0.0, T2: 0.20, T3: 0.0, T4: -0.12 }, source: "BHP H1 FY26 filing", freshness: "Current" },
    { id: "e5", title: "Simandou potential 60\u2013120 Mtpa supply risk from late 2020s", domain: "Competitor", quality: "MEDIUM", date: "2026-01-15", dir: { T1: 0, T2: -1, T3: 1, T4: 1 }, contribution: { T1: 0.0, T2: -0.06, T3: 0.08, T4: 0.05 }, source: "Rio Tinto investor briefing", freshness: "Current" },
    { id: "e6", title: "Nickel West impairment (US$2.5B) \u2013 cycle / forecasting error", domain: "Regulatory", quality: "HIGH", date: "2024-08-01", dir: { T1: 0, T2: 0, T3: 0, T4: 1 }, contribution: { T1: 0.0, T2: 0.0, T3: 0.0, T4: 0.11 }, source: "BHP FY24 annual report", freshness: "Dated" },
    { id: "e7", title: "OZ Minerals integration on track \u2013 SA copper province (motivated)", domain: "Corporate", quality: "LOW", date: "2026-02-01", dir: { T1: 1, T2: 0, T3: 0, T4: 0 }, contribution: { T1: 0.04, T2: 0.0, T3: 0.0, T4: 0.0 }, source: "BHP investor presentation", freshness: "Current" },
  ],
  meta: {
    hypothesisVintage: 1, vintageDate: "2026-02-16", priorVintageDate: null,
    domainsCovered: 10, domainsTotal: 10, analystNote: null,
  },
};

// ── TECHCO_FIXTURE ─────────────────────────────────────────────────────────────
// 3 hypotheses  p = [0.55, 0.25, 0.20]  all p_prior = null
// constructive = T1 + T3  downside = T2
// 2 evidence items (sparse), 2 tripwires
// Computed: Leading, tension=null, skewScore=75, "Constructive"

export const TECHCO_FIXTURE: StockModel = {
  stock: {
    name: "TechCo Limited",
    ticker: "TCO.AX",
    exchange: "ASX",
    sector: "Technology",
    asOf: "2026-02-16",
    price: "A$2.45",
    currency: "AUD",
  },
  hypotheses: [
    {
      code: "T1", name: "Platform Monetisation", stance: "BULLISH", p: 0.55, p_prior: null,
      short: "SaaS conversion accelerates; ARR compounds above 40% pa.",
      requires: ["ARR > A$50M by FY27", "Churn < 5% annually", "Gross margin > 70%"],
      supportingEvidence: ["e1"], contradictingEvidence: [],
    },
    {
      code: "T2", name: "Cash Runway Risk", stance: "BEARISH", p: 0.25, p_prior: null,
      short: "Burn rate outpaces revenue growth; dilutive raise required within 12 months.",
      requires: ["Monthly burn > A$2M", "Revenue misses Q3 guidance by >15%"],
      supportingEvidence: ["e2"], contradictingEvidence: ["e1"],
    },
    {
      code: "T3", name: "Acqui-hire Exit", stance: "NEUTRAL", p: 0.20, p_prior: null,
      short: "Sector consolidator acquires team and IP at modest premium.",
      requires: ["Strategic buyer emerges", "Board approves process"],
      supportingEvidence: [], contradictingEvidence: [],
    },
  ],
  constructiveCodes: ["T1", "T3"],
  downsideCodes: ["T2"],
  tripwires: [
    {
      id: "tw1", timeframe: "MAY 2026", title: "Q3 FY26 Revenue Report",
      condition_good: "Revenue exceeds A$8M quarterly run-rate AND cash burn stabilises",
      effect_good: "T1 strengthens; path to profitability credible",
      condition_bad: "Revenue below A$6M OR cash position < A$5M",
      effect_bad: "T2 strengthens; dilutive capital raise becomes likely",
      cadence: "Quarterly", source: "ASX quarterly activities report",
      currentReading: null, proximity: null,
    },
    {
      id: "tw2", timeframe: "H2 2026", title: "Strategic Review Outcome",
      condition_good: "No transaction; management reaffirms independence and profitability roadmap",
      effect_good: "T1 confirmed; T3 weight reduces",
      condition_bad: "M&A process initiated or capital raise at >20% discount",
      effect_bad: "T2 or T3 gains weight; T1 thesis under pressure",
      cadence: "Ad hoc (board announcements)", source: "ASX announcements",
      currentReading: null, proximity: null,
    },
  ],
  evidence: [
    {
      id: "e1", title: "Q2 FY26 ARR +38% YoY; gross margin 72%; cash A$12M",
      domain: "Regulatory", quality: "HIGH", date: "2026-01-31",
      dir: { T1: 1, T2: -1, T3: 0 },
      contribution: { T1: 0.30, T2: -0.20, T3: 0.0 },
      source: "ASX quarterly activities report, Jan 2026", freshness: "Current",
    },
    {
      id: "e2", title: "CFO resignation and search underway; succession unclear",
      domain: "Governance", quality: "MEDIUM", date: "2026-02-10",
      dir: { T1: -1, T2: 1, T3: 1 },
      contribution: { T1: -0.10, T2: 0.15, T3: 0.08 },
      source: "ASX announcement, Feb 2026", freshness: "Current",
    },
  ],
  meta: {
    hypothesisVintage: 1, vintageDate: "2026-02-16", priorVintageDate: null,
    domainsCovered: 10, domainsTotal: 10, analystNote: null,
  },
};

// ── DIFFUSE_FIXTURE ────────────────────────────────────────────────────────────
// 5 hypotheses  p = [0.22, 0.21, 0.20, 0.19, 0.18]  all p_prior = 0.20
// constructive = T1 + T2 + T5  downside = T3 + T4
// hypothesisVintage = 2
// Computed: Contested (gap=0.01 < 0.08), conviction near 0, tension=null, all arrows FLAT

export const DIFFUSE_FIXTURE: StockModel = {
  stock: {
    name: "InduCo Holdings",
    ticker: "IDC.AX",
    exchange: "ASX",
    sector: "Industrials",
    asOf: "2026-02-16",
    price: "A$8.90",
    currency: "AUD",
  },
  hypotheses: [
    {
      code: "T1", name: "Sector Re-rating", stance: "BULLISH", p: 0.22, p_prior: 0.20,
      short: "Infrastructure spend drives PE multiple expansion across sector.",
      requires: ["Government capex programme confirmed", "Peer multiples expand > 15%"],
      supportingEvidence: ["e1", "e5"], contradictingEvidence: ["e3"],
    },
    {
      code: "T2", name: "Gradual Recovery", stance: "NEUTRAL", p: 0.21, p_prior: 0.20,
      short: "Slow normalisation of order book; margin recovery over 18-24 months.",
      requires: ["Order intake grows > 5% pa", "Input cost inflation below 3%"],
      supportingEvidence: ["e2", "e5"], contradictingEvidence: ["e3"],
    },
    {
      code: "T3", name: "Rate Pressure", stance: "BEARISH", p: 0.20, p_prior: 0.20,
      short: "Sustained high rates compress capital project IRRs; order deferrals rise.",
      requires: ["RBA cash rate stays > 4% through CY2026", "Order deferrals > 20%"],
      supportingEvidence: ["e3"], contradictingEvidence: ["e1", "e2"],
    },
    {
      code: "T4", name: "Credit Event", stance: "BEARISH", p: 0.19, p_prior: 0.20,
      short: "Leveraged balance sheet exposes company to credit market stress.",
      requires: ["Credit spreads widen > 150 bps", "Refinancing at materially higher rates"],
      supportingEvidence: ["e4"], contradictingEvidence: ["e5"],
    },
    {
      code: "T5", name: "M&A Target", stance: "BULLISH", p: 0.18, p_prior: 0.20,
      short: "Sector consolidation makes IDC an attractive bolt-on at 30-40% premium.",
      requires: ["Strategic buyer has balance sheet capacity", "Board receptive to approach"],
      supportingEvidence: ["e1"], contradictingEvidence: [],
    },
  ],
  constructiveCodes: ["T1", "T2", "T5"],
  downsideCodes: ["T3", "T4"],
  tripwires: [
    {
      id: "tw1", timeframe: "APR 2026", title: "RBA Rate Decision",
      condition_good: "RBA cuts or signals cuts by mid-2026",
      effect_good: "T3 weight reduces; T1 and T2 strengthen as capex outlook improves",
      condition_bad: "RBA holds or raises; terminal rate guidance above 4.5%",
      effect_bad: "T3 strengthens; order deferral risk rises; T4 tail grows",
      cadence: "8 times per year", source: "RBA monetary policy statements",
      currentReading: null, proximity: null,
    },
    {
      id: "tw2", timeframe: "AUG 2026", title: "FY26 Results - Order Book Review",
      condition_good: "Order intake +8% YoY; net debt / EBITDA < 2.0x",
      effect_good: "T2 confirmed; T4 tail risk diminishes",
      condition_bad: "Order intake flat or negative; leverage rises above 2.5x",
      effect_bad: "T3 and T4 gain weight; credit market scrutiny intensifies",
      cadence: "Annual (results)", source: "ASX full-year results announcement",
      currentReading: null, proximity: null,
    },
    {
      id: "tw3", timeframe: "ONGOING", title: "M&A Activity Monitor",
      condition_good: "Sector peer transaction announced at >30% premium to NTA",
      effect_good: "T5 activates; M&A optionality repriced by market",
      condition_bad: "Potential acquirer divests assets or announces competing acquisition",
      effect_bad: "T5 weight reduces; redistribute to T1 or T2",
      cadence: "Continuous monitoring", source: "ASX announcements; Bloomberg M&A feed",
      currentReading: null, proximity: null,
    },
  ],
  evidence: [
    {
      id: "e1", title: "Federal government A$120B infrastructure pipeline confirmed for CY2026-28",
      domain: "Economic", quality: "HIGH", date: "2026-01-20",
      dir: { T1: 1, T2: 1, T3: -1, T4: 0, T5: 1 },
      contribution: { T1: 0.15, T2: 0.10, T3: -0.12, T4: 0.0, T5: 0.08 },
      source: "Federal Budget Mid-Year Update, Jan 2026", freshness: "Current",
    },
    {
      id: "e2", title: "IDC order intake +4% YoY in H1 FY26; margins recovering to 14%",
      domain: "Regulatory", quality: "HIGH", date: "2026-02-10",
      dir: { T1: 0, T2: 1, T3: -1, T4: -1, T5: 0 },
      contribution: { T1: 0.0, T2: 0.18, T3: -0.10, T4: -0.08, T5: 0.0 },
      source: "IDC H1 FY26 ASX filing", freshness: "Current",
    },
    {
      id: "e3", title: "RBA holds at 4.35%; board minutes signal caution on inflation persistence",
      domain: "Economic", quality: "HIGH", date: "2026-02-04",
      dir: { T1: -1, T2: -1, T3: 1, T4: 1, T5: 0 },
      contribution: { T1: -0.12, T2: -0.08, T3: 0.16, T4: 0.10, T5: 0.0 },
      source: "RBA Board Minutes, Feb 2026", freshness: "Current",
    },
    {
      id: "e4", title: "IDC net debt / EBITDA 2.1x; refinancing due FY27; spread +80 bps on prior",
      domain: "Broker", quality: "MEDIUM", date: "2026-01-28",
      dir: { T1: 0, T2: 0, T3: 1, T4: 1, T5: -1 },
      contribution: { T1: 0.0, T2: 0.0, T3: 0.06, T4: 0.12, T5: -0.05 },
      source: "Macquarie credit research, Jan 2026", freshness: "Current",
    },
    {
      id: "e5", title: "Sector M&A: peer acquired at 35% premium; consolidation wave cited",
      domain: "Competitor", quality: "HIGH", date: "2026-02-12",
      dir: { T1: 1, T2: 1, T3: 0, T4: -1, T5: 1 },
      contribution: { T1: 0.08, T2: 0.05, T3: 0.0, T4: -0.06, T5: 0.14 },
      source: "ASX announcement; Bloomberg", freshness: "Current",
    },
  ],
  meta: {
    hypothesisVintage: 2, vintageDate: "2026-02-16", priorVintageDate: "2025-08-16",
    domainsCovered: 10, domainsTotal: 10, analystNote: null,
  },
};
