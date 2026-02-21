import type {
  StockModel,
  Hypothesis,
  Arrow,
  DominanceLabel,
  MomentumLabel,
  HypothesisStatus,
  DerivedMetrics,
  TensionSignal,
  TensionColour,
  ConvictionLabel,
  SkewLabel,
  ProximityLabel,
} from "./types";

// computeGap: sorted[0].p - sorted[1].p
export function computeGap(sorted: number[]): number {
  return (sorted[0] ?? 0) - (sorted[1] ?? 0);
}

// computeHHI: sum(w^2)
export function computeHHI(weights: number[]): number {
  return weights.reduce((acc, w) => acc + w * w, 0);
}

// computeDominance: evaluate in order, return first match
// 1. p1 >= 2/n AND (p1-p2) >= 0.15 => "Dominant"
// 2. (p1-p2) < 0.08 => "Contested"
// 3. hhiRatio < 1.06 => "Diffuse"
// 4. else => "Leading"
export function computeDominance(p1: number, p2: number, n: number, hhiRatio: number): DominanceLabel {
  if (p1 >= 2 / n && (p1 - p2) >= 0.15) return "Dominant";
  if ((p1 - p2) < 0.08) return "Contested";
  if (hhiRatio < 1.06) return "Diffuse";
  return "Leading";
}

// computeConviction: 1 - H/H_max using natural log
// H = -sum(p * Math.log(p))
// H_max = Math.log(n)
export function computeConviction(weights: number[]): number {
  const n = weights.length;
  if (n <= 1) return 1;
  const H = weights.reduce((acc, w) => {
    if (w <= 0) return acc;
    return acc - w * Math.log(w);
  }, 0);
  const Hmax = Math.log(n);
  return 1 - H / Hmax;
}

// classifyConviction thresholds (boundary belongs to upper label):
// < 0.05 => Uninformative
// 0.05..0.15 => Low (0.05 is Low)
// 0.15..0.35 => Moderate (0.15 is Moderate)
// > 0.35 => High (0.35 is High)
export function classifyConviction(conviction: number): ConvictionLabel {
  if (conviction < 0.05) return "Uninformative";
  if (conviction < 0.15) return "Low";
  if (conviction < 0.35) return "Moderate";
  return "High";
}

// computeSkew:
// constructiveMass = sum(h.p where code in constructiveCodes)
// downsideMass = 1 - constructiveMass
// skew = constructiveMass - downsideMass
// skewScore = Math.round(50 + 50 * skew)
export function computeSkew(
  hypotheses: Hypothesis[],
  constructiveCodes: string[],
): { constructiveMass: number; downsideMass: number; skew: number; skewScore: number } {
  const cSet = new Set(constructiveCodes);
  const constructiveMass = hypotheses.reduce((acc, h) => cSet.has(h.code) ? acc + h.p : acc, 0);
  const downsideMass = 1 - constructiveMass;
  const skew = constructiveMass - downsideMass;
  const skewScore = Math.round(50 + 50 * skew);
  return { constructiveMass, downsideMass, skew, skewScore };
}

// classifySkew thresholds (boundary belongs to upper label):
// >= 65 => Constructive
// 55..64 => Leaning Constructive (55 is Leaning Constructive)
// 45..54 => Balanced (45 is Balanced)
// 36..44 => Leaning Downside (36 is Leaning Downside)
// <= 35 => Downside
export function classifySkew(skewScore: number): SkewLabel {
  if (skewScore >= 65) return "Constructive";
  if (skewScore >= 55) return "Leaning Constructive";
  if (skewScore >= 45) return "Balanced";
  if (skewScore >= 36) return "Leaning Downside";
  return "Downside";
}

// computeTransitionProximity: Math.max(0, Math.min(1, 1 - (gap / 0.15)))
export function computeTransitionProximity(gap: number): number {
  return Math.max(0, Math.min(1, 1 - gap / 0.15));
}

// classifyProximity (boundary belongs to upper label):
// < 0.3 => Stable
// 0.3..0.6 => Watchable (0.3 is Watchable)
// 0.6..0.85 => Elevated (0.6 is Elevated)
// > 0.85 => Fragile (0.85 is Fragile)
export function classifyProximity(proximity: number): ProximityLabel {
  if (proximity < 0.3) return "Stable";
  if (proximity < 0.6) return "Watchable";
  if (proximity < 0.85) return "Elevated";
  return "Fragile";
}

// computeStatus: CRITICAL — when p_prior is null, use 1/n as prior
// delta = h.p - p_prior (using 1/n if null)
// arrow: delta > 0.03 => UP, delta < -0.03 => DOWN, else FLAT
// label lookup:
//   UP + BULLISH => Building
//   UP + NEUTRAL => Building
//   UP + BEARISH => Strengthening
//   DOWN + any   => Fading
//   FLAT + isLead => Priced
//   FLAT + BEARISH + !isLead => Watching
//   FLAT + !BEARISH + !isLead => Stable
export function computeStatus(
  hypothesis: Hypothesis,
  isLead: boolean,
  n: number,
): HypothesisStatus {
  const p_prior = hypothesis.p_prior !== null ? hypothesis.p_prior : 1 / n;
  const delta = hypothesis.p - p_prior;
  let arrow: Arrow;
  if (delta > 0.03) arrow = "UP";
  else if (delta < -0.03) arrow = "DOWN";
  else arrow = "FLAT";

  let label: MomentumLabel;
  if (arrow === "UP") {
    label = hypothesis.stance === "BEARISH" ? "Strengthening" : "Building";
  } else if (arrow === "DOWN") {
    label = "Fading";
  } else {
    // FLAT
    if (isLead) label = "Priced";
    else if (hypothesis.stance === "BEARISH") label = "Watching";
    else label = "Stable";
  }
  return { arrow, label };
}

// computeTension: evaluate conditions IN ORDER, return first match, else null
// Uses sorted[0] (lead), NOT hard-coded T1
// IMPORTANT: messages use pct = Math.round(sorted[0].p*100), gap = Math.round((sorted[0].p - sorted[1].p)*100)
export function computeTension(
  sorted: Hypothesis[],
  dominance: DominanceLabel,
  conviction: number,
  transitionProximity: number,
  statuses: Record<string, HypothesisStatus>,
  n: number,
): TensionSignal | null {
  const lead = sorted[0];
  const challenger = sorted[1];
  if (!lead || !challenger) return null;
  const pct = Math.round(lead.p * 100);
  const gap = Math.round((lead.p - challenger.p) * 100);

  // 1. CONTESTED LEAD
  if (lead.p >= 0.30 && dominance === "Contested") {
    return {
      label: "CONTESTED LEAD",
      colour: "amber",
      message: `${lead.name} leads at ${pct}% but ${challenger.name} is within ${gap} points. Evidence does not support high-conviction positioning.`,
    };
  }

  // 2. FRAGILE MOMENTUM — check lead's arrow
  if (statuses[lead.code]?.arrow === "UP" && transitionProximity > 0.60) {
    return {
      label: "FRAGILE MOMENTUM",
      colour: "amber",
      message: `${lead.name} is gaining weight but the regime is fragile. ${gap} point lead could flip on a single catalyst.`,
    };
  }

  // 3. BEAR REGIME — check lead's stance
  if (lead.stance === "BEARISH" && (dominance === "Dominant" || dominance === "Leading")) {
    return {
      label: "BEAR REGIME",
      colour: "red",
      message: `A bearish thesis (${lead.name}) leads the evidence. Downside is the path of least resistance.`,
    };
  }

  // 4. RAPID SHIFT, LOW CONVICTION
  if (conviction < 0.05) {
    let maxDelta = 0;
    let maxName = "";
    for (const h of sorted) {
      const p_prior = h.p_prior !== null ? h.p_prior : 1 / n;
      const absDelta = Math.abs(h.p - p_prior);
      if (absDelta > maxDelta) { maxDelta = absDelta; maxName = h.name; }
    }
    if (maxDelta > 0.05) {
      return {
        label: "RAPID SHIFT, LOW CONVICTION",
        colour: "amber",
        message: `Evidence is moving fast but overall conviction remains low. ${maxName} surging on thin evidence base.`,
      };
    }
  }

  // 5. CLEAR SIGNAL
  if (dominance === "Dominant" && conviction > 0.35) {
    return {
      label: "CLEAR SIGNAL",
      colour: "green",
      message: `Evidence strongly concentrated on ${lead.name}. ${gap} point lead with high conviction.`,
    };
  }

  return null;
}

// computeAllMetrics: master entry point
export function computeAllMetrics(model: StockModel): DerivedMetrics {
  const { hypotheses, constructiveCodes } = model;
  const n = hypotheses.length;

  // Stable sort by p desc; tiebreak: higher code number wins
  function codeNumber(code: string): number {
    const m = code.match(/(\d+)$/);
    return m ? parseInt(m[1], 10) : 0;
  }
  const sorted = [...hypotheses].sort((a, b) => {
    if (Math.abs(a.p - b.p) > 1e-9) return b.p - a.p;
    return codeNumber(b.code) - codeNumber(a.code);
  });

  const weights = sorted.map(h => h.p);
  const gap = computeGap(weights);
  const ratio = sorted[1] && sorted[1].p > 0 ? sorted[0].p / sorted[1].p : Infinity;
  const hhi = computeHHI(weights);
  const hhiUniform = 1 / n;
  const hhiRatio = hhi / hhiUniform;
  const dominance = computeDominance(sorted[0].p, sorted[1]?.p ?? 0, n, hhiRatio);
  const conviction = computeConviction(weights);
  const convictionLabel = classifyConviction(conviction);

  const { constructiveMass, downsideMass, skew, skewScore } = computeSkew(hypotheses, constructiveCodes);
  const skewLabel = classifySkew(skewScore);
  const transitionProximity = computeTransitionProximity(gap);
  const proximityLabel = classifyProximity(transitionProximity);

  // Compute statuses
  const statuses: Record<string, HypothesisStatus> = {};
  sorted.forEach((h, idx) => {
    statuses[h.code] = computeStatus(h, idx === 0, n);
  });

  const tension = computeTension(sorted, dominance, conviction, transitionProximity, statuses, n);

  return {
    n,
    sorted,
    gap,
    ratio,
    hhi,
    hhiUniform,
    hhiRatio,
    dominance,
    conviction,
    convictionLabel,
    constructiveMass,
    downsideMass,
    skew,
    skewScore,
    skewLabel,
    transitionProximity,
    proximityLabel,
    statuses,
    tension,
  };
}
