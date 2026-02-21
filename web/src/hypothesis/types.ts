// ── Enums and Literals ──

export type Stance = "BULLISH" | "NEUTRAL" | "BEARISH";
export type Arrow = "UP" | "FLAT" | "DOWN";
export type EvidenceQuality = "HIGH" | "MEDIUM" | "LOW";

export type EvidenceDomain =
  | "Regulatory"
  | "Economic"
  | "Academic"
  | "Competitor"
  | "Broker"
  | "Governance"
  | "Ownership"
  | "Alternative"
  | "Corporate"
  | "Media";

export type DominanceLabel = "Dominant" | "Contested" | "Diffuse" | "Leading";
export type ConvictionLabel = "Uninformative" | "Low" | "Moderate" | "High";
export type SkewLabel = "Constructive" | "Leaning Constructive" | "Balanced" | "Leaning Downside" | "Downside";
export type ProximityLabel = "Stable" | "Watchable" | "Elevated" | "Fragile";
export type MomentumLabel = "Building" | "Strengthening" | "Fading" | "Priced" | "Watching" | "Stable";
export type TensionLabel = "CONTESTED LEAD" | "FRAGILE MOMENTUM" | "BEAR REGIME" | "RAPID SHIFT, LOW CONVICTION" | "CLEAR SIGNAL";
export type TensionColour = "amber" | "red" | "green";

// ── Data Model ──

export interface Hypothesis {
  code: string;
  name: string;
  stance: Stance;
  p: number;
  p_prior: number | null;
  short: string;
  requires: string[];
  supportingEvidence: string[];
  contradictingEvidence: string[];
}

export interface EvidenceItem {
  id: string;
  title: string;
  domain: EvidenceDomain;
  quality: EvidenceQuality;
  date: string;
  dir: Record<string, -1 | 0 | 1>;
  contribution: Record<string, number> | null;
  source: string;
  freshness: "Current" | "Recent" | "Dated";
}

export interface Tripwire {
  id: string;
  timeframe: string;
  title: string;
  condition_good: string;
  effect_good: string;
  condition_bad: string;
  effect_bad: string;
  cadence: string;
  source: string;
  currentReading: string | null;
  proximity: "CLEAR" | "APPROACHING" | "AT_THRESHOLD" | "BREACHED" | null;
}

export interface StockMeta {
  hypothesisVintage: number;
  vintageDate: string;
  priorVintageDate: string | null;
  domainsCovered: number;
  domainsTotal: 10;
  analystNote: string | null;
}

export interface StockModel {
  stock: {
    name: string;
    ticker: string;
    exchange: string;
    sector: string;
    asOf: string;
    price: string;
    currency: string;
  };
  hypotheses: Hypothesis[];
  constructiveCodes: string[];
  downsideCodes: string[];
  tripwires: Tripwire[];
  evidence: EvidenceItem[];
  meta: StockMeta;
}

// ── Derived Metric Outputs ──

export interface HypothesisStatus {
  arrow: Arrow;
  label: MomentumLabel;
}

export interface DerivedMetrics {
  n: number;
  sorted: Hypothesis[];
  gap: number;
  ratio: number;
  hhi: number;
  hhiUniform: number;
  hhiRatio: number;
  dominance: DominanceLabel;
  conviction: number;
  convictionLabel: ConvictionLabel;
  constructiveMass: number;
  downsideMass: number;
  skew: number;
  skewScore: number;
  skewLabel: SkewLabel;
  transitionProximity: number;
  proximityLabel: ProximityLabel;
  statuses: Record<string, HypothesisStatus>;
  tension: TensionSignal | null;
}

export interface TensionSignal {
  label: TensionLabel;
  colour: TensionColour;
  message: string;
}
