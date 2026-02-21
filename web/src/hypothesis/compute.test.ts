import { describe, it, expect } from "vitest";
import {
  computeGap,
  computeHHI,
  computeDominance,
  computeConviction,
  classifyConviction,
  computeSkew,
  classifySkew,
  computeStatus,
  computeTension,
  computeAllMetrics,
} from "./compute";
import { validate } from "./validate";
import { BHP_FIXTURE, TECHCO_FIXTURE, DIFFUSE_FIXTURE } from "./fixtures";
import type { Hypothesis, HypothesisStatus } from "./types";

// ── Helper: compute hhiRatio from weights ──────────────────────────────────────

function hhiRatioFromWeights(weights: number[]): number {
  const hhi = weights.reduce((acc, w) => acc + w * w, 0);
  const n = weights.length;
  const hhiUniform = 1 / n;
  return hhi / hhiUniform;
}

// ── computeHHI ────────────────────────────────────────────────────────────────

describe("computeHHI", () => {
  it("BHP weights: 0.34²+0.30²+0.21²+0.15² ≈ 0.2722", () => {
    expect(computeHHI([0.34, 0.30, 0.21, 0.15])).toBeCloseTo(0.2722, 3);
  });

  it("uniform 4-way = 0.25", () => {
    expect(computeHHI([0.25, 0.25, 0.25, 0.25])).toBeCloseTo(0.25, 4);
  });

  it("single hypothesis = 1.0", () => {
    expect(computeHHI([1.0])).toBe(1.0);
  });
});

// ── computeDominance (10 cases) ───────────────────────────────────────────────

describe("computeDominance", () => {
  it("case 1: [0.34,0.30,0.21,0.15] n=4 => Contested (gap=0.04 < 0.08)", () => {
    const w = [0.34, 0.30, 0.21, 0.15];
    expect(computeDominance(w[0], w[1], 4, hhiRatioFromWeights(w))).toBe("Contested");
  });

  it("case 2: [0.55,0.20,0.15,0.10] n=4 => Dominant (p1>=0.50, gap=0.35>=0.15)", () => {
    const w = [0.55, 0.20, 0.15, 0.10];
    expect(computeDominance(w[0], w[1], 4, hhiRatioFromWeights(w))).toBe("Dominant");
  });

  it("case 3: [0.36,0.34,0.20,0.10] n=4 => Contested (gap=0.02 < 0.08)", () => {
    const w = [0.36, 0.34, 0.20, 0.10];
    expect(computeDominance(w[0], w[1], 4, hhiRatioFromWeights(w))).toBe("Contested");
  });

  it("case 4: [0.26,0.25,0.25,0.24] n=4 => Contested (gap=0.01 < 0.08; NOT Diffuse — Contested fires first)", () => {
    const w = [0.26, 0.25, 0.25, 0.24];
    expect(computeDominance(w[0], w[1], 4, hhiRatioFromWeights(w))).toBe("Contested");
  });

  it("case 5: [0.40,0.25,0.20,0.15] n=4 => Leading", () => {
    const w = [0.40, 0.25, 0.20, 0.15];
    expect(computeDominance(w[0], w[1], 4, hhiRatioFromWeights(w))).toBe("Leading");
  });

  it("case 6: [0.50,0.30,0.20] n=3 => Leading (0.50 < 2/3=0.667)", () => {
    const w = [0.50, 0.30, 0.20];
    expect(computeDominance(w[0], w[1], 3, hhiRatioFromWeights(w))).toBe("Leading");
  });

  it("case 7: [0.70,0.20,0.10] n=3 => Dominant (0.70>=0.667, gap=0.50>=0.15)", () => {
    const w = [0.70, 0.20, 0.10];
    expect(computeDominance(w[0], w[1], 3, hhiRatioFromWeights(w))).toBe("Dominant");
  });

  it("case 8: [0.22,0.21,0.20,0.19,0.18] n=5 => Contested (gap=0.01 < 0.08)", () => {
    const w = [0.22, 0.21, 0.20, 0.19, 0.18];
    expect(computeDominance(w[0], w[1], 5, hhiRatioFromWeights(w))).toBe("Contested");
  });

  it("case 9: [0.45,0.30,0.15,0.10] n=4 => Leading", () => {
    const w = [0.45, 0.30, 0.15, 0.10];
    expect(computeDominance(w[0], w[1], 4, hhiRatioFromWeights(w))).toBe("Leading");
  });

  it("case 10: [0.35,0.35,0.20,0.10] n=4 => Contested (gap=0.00 < 0.08)", () => {
    const w = [0.35, 0.35, 0.20, 0.10];
    expect(computeDominance(w[0], w[1], 4, hhiRatioFromWeights(w))).toBe("Contested");
  });
});

// ── computeConviction (4 cases) ───────────────────────────────────────────────

describe("computeConviction", () => {
  it("case 1: [0.25,0.25,0.25,0.25] => exactly 0.0 (uniform => max entropy)", () => {
    expect(computeConviction([0.25, 0.25, 0.25, 0.25])).toBeCloseTo(0.0, 4);
  });

  it("case 2: [0.34,0.30,0.21,0.15] => approx 0.033", () => {
    expect(computeConviction([0.34, 0.30, 0.21, 0.15])).toBeCloseTo(0.033, 2);
  });

  it("case 3: [0.70,0.20,0.10] => approx 0.270 (formula: 1 - H/Hmax where H=-sum(p*ln(p)), Hmax=ln(3))", () => {
    // H = -0.70*ln(0.70)-0.20*ln(0.20)-0.10*ln(0.10) ≈ 0.8018
    // Hmax = ln(3) ≈ 1.0986
    // conviction = 1 - 0.8018/1.0986 ≈ 0.270
    // Note: spec states 0.206 but formula yields 0.270 — implement formula as written
    expect(computeConviction([0.70, 0.20, 0.10])).toBeCloseTo(0.270, 2);
  });

  it("case 4: [0.97,0.01,0.01,0.01] => > 0.60", () => {
    expect(computeConviction([0.97, 0.01, 0.01, 0.01])).toBeGreaterThan(0.60);
  });
});

// ── classifyConviction ────────────────────────────────────────────────────────

describe("classifyConviction", () => {
  it("< 0.05 => Uninformative", () => {
    expect(classifyConviction(0.01)).toBe("Uninformative");
    expect(classifyConviction(0.049)).toBe("Uninformative");
  });

  it("0.05 => Low (boundary belongs to upper)", () => {
    expect(classifyConviction(0.05)).toBe("Low");
  });

  it("0.10 => Low", () => {
    expect(classifyConviction(0.10)).toBe("Low");
  });

  it("0.15 => Moderate (boundary belongs to upper)", () => {
    expect(classifyConviction(0.15)).toBe("Moderate");
  });

  it("0.35 => High (boundary belongs to upper)", () => {
    expect(classifyConviction(0.35)).toBe("High");
  });

  it("> 0.35 => High", () => {
    expect(classifyConviction(0.80)).toBe("High");
  });
});

// ── computeSkew (3 fixture cases) ─────────────────────────────────────────────

describe("computeSkew", () => {
  it("BHP: constructiveCodes=[T1,T2], p=[0.34,0.30,0.21,0.15] => skewScore=64, label=Leaning Constructive", () => {
    const { skewScore } = computeSkew(BHP_FIXTURE.hypotheses, BHP_FIXTURE.constructiveCodes);
    // constructiveMass = 0.34+0.30 = 0.64
    // skew = 0.64 - 0.36 = 0.28
    // skewScore = Math.round(50 + 50*0.28) = Math.round(50+14) = 64
    expect(skewScore).toBe(64);
    expect(classifySkew(skewScore)).toBe("Leaning Constructive");
  });

  it("TECHCO: constructiveCodes=[T1,T3], p=[0.55,0.25,0.20] => skewScore=75, label=Constructive", () => {
    const { skewScore } = computeSkew(TECHCO_FIXTURE.hypotheses, TECHCO_FIXTURE.constructiveCodes);
    // constructiveMass = 0.55+0.20 = 0.75
    // skew = 0.75 - 0.25 = 0.50
    // skewScore = Math.round(50 + 50*0.50) = Math.round(75) = 75
    expect(skewScore).toBe(75);
    expect(classifySkew(skewScore)).toBe("Constructive");
  });

  it("DIFFUSE: constructiveCodes=[T1,T2,T5], p=[0.22,0.21,...,0.18] => skewScore=61, label=Leaning Constructive", () => {
    const { skewScore } = computeSkew(DIFFUSE_FIXTURE.hypotheses, DIFFUSE_FIXTURE.constructiveCodes);
    // constructiveMass = 0.22+0.21+0.18 = 0.61
    // skew = 0.61 - 0.39 = 0.22
    // skewScore = Math.round(50 + 50*0.22) = Math.round(61) = 61
    expect(skewScore).toBe(61);
    expect(classifySkew(skewScore)).toBe("Leaning Constructive");
  });
});

// ── classifySkew ──────────────────────────────────────────────────────────────

describe("classifySkew", () => {
  it(">= 65 => Constructive", () => {
    expect(classifySkew(65)).toBe("Constructive");
    expect(classifySkew(100)).toBe("Constructive");
  });

  it("55..64 => Leaning Constructive (55 is Leaning Constructive)", () => {
    expect(classifySkew(55)).toBe("Leaning Constructive");
    expect(classifySkew(64)).toBe("Leaning Constructive");
  });

  it("45..54 => Balanced (45 is Balanced)", () => {
    expect(classifySkew(45)).toBe("Balanced");
    expect(classifySkew(54)).toBe("Balanced");
  });

  it("36..44 => Leaning Downside (36 is Leaning Downside)", () => {
    expect(classifySkew(36)).toBe("Leaning Downside");
    expect(classifySkew(44)).toBe("Leaning Downside");
  });

  it("<= 35 => Downside", () => {
    expect(classifySkew(35)).toBe("Downside");
    expect(classifySkew(0)).toBe("Downside");
  });
});

// ── computeStatus (5 momentum cases) ─────────────────────────────────────────

describe("computeStatus momentum cases", () => {
  function makeHyp(p: number, p_prior: number | null, stance: "BULLISH" | "NEUTRAL" | "BEARISH"): Hypothesis {
    return {
      code: "T1", name: "Test", stance, p, p_prior,
      short: "", requires: [], supportingEvidence: [], contradictingEvidence: [],
    };
  }

  it("case 1: p=0.34, p_prior=null (use 1/4=0.25), n=4, BULLISH, isLead=true => arrow=UP, label=Building", () => {
    // delta = 0.34 - 0.25 = 0.09 > 0.03
    const h = makeHyp(0.34, null, "BULLISH");
    const status = computeStatus(h, true, 4);
    expect(status.arrow).toBe("UP");
    expect(status.label).toBe("Building");
  });

  it("case 2: p=0.15, p_prior=null (use 1/4=0.25), n=4, BEARISH, isLead=false => arrow=DOWN, label=Fading", () => {
    // delta = 0.15 - 0.25 = -0.10 < -0.03
    const h = makeHyp(0.15, null, "BEARISH");
    const status = computeStatus(h, false, 4);
    expect(status.arrow).toBe("DOWN");
    expect(status.label).toBe("Fading");
  });

  it("case 3: p=0.30, p_prior=0.28, n=4, NEUTRAL, isLead=true => arrow=FLAT, label=Priced", () => {
    // delta = 0.30 - 0.28 = 0.02 < 0.03
    const h = makeHyp(0.30, 0.28, "NEUTRAL");
    const status = computeStatus(h, true, 4);
    expect(status.arrow).toBe("FLAT");
    expect(status.label).toBe("Priced");
  });

  it("case 4: p=0.21, p_prior=0.22, n=4, BEARISH, isLead=false => arrow=FLAT, label=Watching", () => {
    // delta = 0.21 - 0.22 = -0.01; |delta| < 0.03
    const h = makeHyp(0.21, 0.22, "BEARISH");
    const status = computeStatus(h, false, 4);
    expect(status.arrow).toBe("FLAT");
    expect(status.label).toBe("Watching");
  });

  it("case 5: p=0.35, p_prior=0.28, n=4, BEARISH, isLead=true => arrow=UP, label=Strengthening", () => {
    // delta = 0.35 - 0.28 = 0.07 > 0.03
    const h = makeHyp(0.35, 0.28, "BEARISH");
    const status = computeStatus(h, true, 4);
    expect(status.arrow).toBe("UP");
    expect(status.label).toBe("Strengthening");
  });
});

// ── computeTension (6 cases) ──────────────────────────────────────────────────

describe("computeTension", () => {
  function makeHyp(
    code: string,
    name: string,
    p: number,
    p_prior: number | null,
    stance: "BULLISH" | "NEUTRAL" | "BEARISH"
  ): Hypothesis {
    return {
      code, name, stance, p, p_prior,
      short: "", requires: [], supportingEvidence: [], contradictingEvidence: [],
    };
  }

  it("case 1: BHP fixture state => CONTESTED LEAD (amber)", () => {
    // BHP: sorted=[T1(0.34),T2(0.30),T3(0.21),T4(0.15)], n=4, dominance=Contested
    // lead=T1, p_prior=null => prior=0.25, delta=0.09 => arrow=UP
    // condition 1: lead.p=0.34>=0.30 AND dominance=Contested => fires
    const sorted = BHP_FIXTURE.hypotheses
      .slice()
      .sort((a, b) => b.p - a.p);
    const n = 4;
    const statuses: Record<string, HypothesisStatus> = {};
    sorted.forEach((h, idx) => {
      const p_prior = h.p_prior !== null ? h.p_prior : 1 / n;
      const delta = h.p - p_prior;
      const arrow = delta > 0.03 ? "UP" : delta < -0.03 ? "DOWN" : "FLAT";
      statuses[h.code] = { arrow, label: "Building" };
    });
    const gap = sorted[0].p - sorted[1].p; // 0.04
    const transitionProximity = Math.max(0, Math.min(1, 1 - gap / 0.15)); // 1 - 0.267 = 0.733

    const result = computeTension(sorted, "Contested", 0.033, transitionProximity, statuses, n);
    expect(result?.label).toBe("CONTESTED LEAD");
    expect(result?.colour).toBe("amber");
  });

  it("case 2: Dominant conviction>0.35 => CLEAR SIGNAL (green) [condition 1 doesn't fire: Dominant != Contested]", () => {
    // sorted=[{p:0.55,name:"A",stance:BULLISH,p_prior:0.40},{p:0.20,...},{p:0.15,...},{p:0.10,...}], n=4
    // lead.p=0.55>=0.30 but dominance=Dominant != Contested => condition 1 doesn't fire
    // lead arrow=UP (delta=0.55-0.40=0.15>0.03), transitionProximity = 1 - (0.35/0.15) = clamped to 0
    // condition 2: arrow=UP but transitionProximity=0 < 0.60 => doesn't fire
    // condition 3: lead.stance=BULLISH => doesn't fire
    // condition 4: conviction=0.38 > 0.05 => doesn't fire
    // condition 5: Dominant AND conviction=0.38>0.35 => fires!
    const sorted = [
      makeHyp("T1", "A", 0.55, 0.40, "BULLISH"),
      makeHyp("T2", "B", 0.20, 0.20, "BULLISH"),
      makeHyp("T3", "C", 0.15, 0.15, "NEUTRAL"),
      makeHyp("T4", "D", 0.10, 0.10, "BEARISH"),
    ];
    const n = 4;
    const statuses: Record<string, HypothesisStatus> = {
      T1: { arrow: "UP", label: "Building" },
      T2: { arrow: "FLAT", label: "Priced" },
      T3: { arrow: "FLAT", label: "Stable" },
      T4: { arrow: "FLAT", label: "Watching" },
    };
    const gap = 0.55 - 0.20; // 0.35
    const transitionProximity = Math.max(0, Math.min(1, 1 - gap / 0.15)); // negative => 0
    const result = computeTension(sorted, "Dominant", 0.38, transitionProximity, statuses, n);
    expect(result?.label).toBe("CLEAR SIGNAL");
    expect(result?.colour).toBe("green");
  });

  it("case 3: BEARISH lead + Leading dominance => BEAR REGIME (red)", () => {
    // sorted=[{p:0.50,name:Bear,stance:BEARISH,...},{...},{...}], dominance=Leading, conviction=0.20
    // condition 1: dominance=Leading != Contested => doesn't fire
    // condition 2: lead arrow - use FLAT (delta small) => doesn't fire
    // condition 3: lead.stance=BEARISH AND dominance=Leading => fires!
    const sorted = [
      makeHyp("T1", "Bear", 0.50, 0.48, "BEARISH"),
      makeHyp("T2", "Bull", 0.30, 0.30, "BULLISH"),
      makeHyp("T3", "Neut", 0.20, 0.22, "NEUTRAL"),
    ];
    const n = 3;
    const statuses: Record<string, HypothesisStatus> = {
      T1: { arrow: "FLAT", label: "Priced" },
      T2: { arrow: "FLAT", label: "Stable" },
      T3: { arrow: "FLAT", label: "Stable" },
    };
    const gap = 0.50 - 0.30; // 0.20
    const transitionProximity = Math.max(0, Math.min(1, 1 - gap / 0.15)); // negative => 0
    const result = computeTension(sorted, "Leading", 0.20, transitionProximity, statuses, n);
    expect(result?.label).toBe("BEAR REGIME");
    expect(result?.colour).toBe("red");
  });

  it("case 4: conviction=0.03 (<0.05) AND |delta|=0.10>0.05 => RAPID SHIFT, LOW CONVICTION (amber)", () => {
    // Need: conviction<0.05, AND one h has |delta|>0.05
    // Also need conditions 1,2,3 to not fire
    // Use lead.p=0.22 < 0.30 => condition 1 doesn't fire
    // Use lead arrow FLAT => condition 2 doesn't fire
    // Use lead stance BULLISH => condition 3 doesn't fire
    // p_prior on T1: p=0.22, p_prior=0.12 => delta=0.10 > 0.05; |delta|=0.10 > 0.03 => arrow=UP
    // Wait: condition 2 checks lead arrow. Let me use lead.p < 0.30 to skip condition 1
    // and make lead arrow FLAT to skip condition 2
    // T1: p=0.22, p_prior=0.22 => delta=0, arrow=FLAT (lead)
    // T2: p=0.21, p_prior=0.11 => delta=0.10, arrow=UP — but T2 is not lead
    const sorted = [
      makeHyp("T1", "A", 0.22, 0.22, "BULLISH"),
      makeHyp("T2", "B", 0.21, 0.11, "BULLISH"),
      makeHyp("T3", "C", 0.20, 0.20, "NEUTRAL"),
      makeHyp("T4", "D", 0.19, 0.25, "BEARISH"),
      makeHyp("T5", "E", 0.18, 0.22, "BEARISH"),
    ];
    const n = 5;
    const statuses: Record<string, HypothesisStatus> = {
      T1: { arrow: "FLAT", label: "Priced" },
      T2: { arrow: "UP", label: "Building" },
      T3: { arrow: "FLAT", label: "Stable" },
      T4: { arrow: "DOWN", label: "Fading" },
      T5: { arrow: "DOWN", label: "Fading" },
    };
    const gap = 0.22 - 0.21; // 0.01
    const transitionProximity = Math.max(0, Math.min(1, 1 - gap / 0.15)); // 1 - 0.067 = 0.933
    // conviction = 0.03 passed directly
    const result = computeTension(sorted, "Contested", 0.03, transitionProximity, statuses, n);
    // condition 1: lead.p=0.22 < 0.30 => doesn't fire
    // condition 2: lead arrow=FLAT => doesn't fire
    // condition 3: lead.stance=BULLISH => doesn't fire
    // condition 4: conviction=0.03 < 0.05, check max delta:
    //   T2: |0.21-0.11|=0.10 > 0.05 => fires!
    expect(result?.label).toBe("RAPID SHIFT, LOW CONVICTION");
    expect(result?.colour).toBe("amber");
  });

  it("case 5: lead arrow=UP AND transitionProximity=0.70>0.60, dominance=Leading (not Contested) => FRAGILE MOMENTUM (amber)", () => {
    // condition 1: dominance=Leading != Contested => doesn't fire
    // condition 2: lead arrow=UP AND transitionProximity=0.70>0.60 => fires!
    const sorted = [
      makeHyp("T1", "Growth", 0.40, 0.33, "BULLISH"), // delta=0.07>0.03 => UP
      makeHyp("T2", "Value", 0.25, 0.25, "NEUTRAL"),
      makeHyp("T3", "Risk", 0.20, 0.22, "BEARISH"),
      makeHyp("T4", "Tail", 0.15, 0.20, "BEARISH"),
    ];
    const n = 4;
    const statuses: Record<string, HypothesisStatus> = {
      T1: { arrow: "UP", label: "Building" },
      T2: { arrow: "FLAT", label: "Stable" },
      T3: { arrow: "FLAT", label: "Watching" },
      T4: { arrow: "DOWN", label: "Fading" },
    };
    const result = computeTension(sorted, "Leading", 0.20, 0.70, statuses, n);
    expect(result?.label).toBe("FRAGILE MOMENTUM");
    expect(result?.colour).toBe("amber");
  });

  it("case 6: DIFFUSE fixture state => null (no condition met)", () => {
    const metrics = computeAllMetrics(DIFFUSE_FIXTURE);
    // lead.p=0.22 < 0.30 => condition 1 doesn't fire
    // lead arrow FLAT => condition 2 doesn't fire
    // lead stance BULLISH => condition 3 doesn't fire
    // conviction near 0 but max |delta| = 0.02 < 0.05 => condition 4 doesn't fire
    // dominance=Contested != Dominant => condition 5 doesn't fire
    expect(metrics.tension).toBeNull();
  });
});

// ── validate (5 cases) ────────────────────────────────────────────────────────

describe("validate", () => {
  it("case 1: BHP_FIXTURE => [] (no errors)", () => {
    expect(validate(BHP_FIXTURE)).toEqual([]);
  });

  it("case 2: modify BHP weights so sum=0.95 => error includes 'Weight sum'", () => {
    const bad = {
      ...BHP_FIXTURE,
      hypotheses: BHP_FIXTURE.hypotheses.map((h, i) =>
        i === 0 ? { ...h, p: 0.29 } : h
      ),
    };
    // sum = 0.29+0.30+0.21+0.15 = 0.95, deviation = 0.05 > 0.01
    const errors = validate(bad);
    expect(errors.some(e => e.includes("Weight sum"))).toBe(true);
  });

  it("case 3: modify one BHP weight to 0 => error includes 'non-positive'", () => {
    const bad = {
      ...BHP_FIXTURE,
      hypotheses: BHP_FIXTURE.hypotheses.map((h, i) =>
        i === 3 ? { ...h, p: 0 } : h
      ),
    };
    const errors = validate(bad);
    expect(errors.some(e => e.includes("non-positive"))).toBe(true);
  });

  it("case 4: evidence with domain=Corporate, quality=HIGH => error includes 'ceiling'", () => {
    const badEvidence = {
      id: "eX",
      title: "Bad evidence",
      domain: "Corporate" as const,
      quality: "HIGH" as const,
      date: "2026-02-16",
      dir: { T1: 0 as const, T2: 0 as const, T3: 0 as const, T4: 0 as const },
      contribution: null,
      source: "Test",
      freshness: "Current" as const,
    };
    const bad = {
      ...BHP_FIXTURE,
      evidence: [...BHP_FIXTURE.evidence, badEvidence],
    };
    const errors = validate(bad);
    expect(errors.some(e => e.includes("ceiling"))).toBe(true);
  });

  it("case 5: BHP with only 1 tripwire => error includes 'tripwire'", () => {
    const bad = {
      ...BHP_FIXTURE,
      tripwires: [BHP_FIXTURE.tripwires[0]],
    };
    const errors = validate(bad);
    expect(errors.some(e => e.includes("tripwire"))).toBe(true);
  });
});

// ── BHP end-to-end (computeAllMetrics) ────────────────────────────────────────

describe("BHP_FIXTURE computeAllMetrics", () => {
  const m = computeAllMetrics(BHP_FIXTURE);

  it("sorted=[T1,T2,T3,T4] by p desc", () => {
    expect(m.sorted.map(h => h.code)).toEqual(["T1", "T2", "T3", "T4"]);
    expect(m.sorted[0].p).toBeCloseTo(0.34, 2);
  });

  it("T1 arrow=UP (p_prior=null uses 1/4=0.25, delta=0.09>0.03)", () => {
    expect(m.statuses["T1"].arrow).toBe("UP");
    expect(m.statuses["T1"].label).toBe("Building");
  });

  it("T4 arrow=DOWN (p_prior=null uses 1/4=0.25, delta=-0.10<-0.03)", () => {
    expect(m.statuses["T4"].arrow).toBe("DOWN");
    expect(m.statuses["T4"].label).toBe("Fading");
  });

  it("dominance=Contested", () => {
    expect(m.dominance).toBe("Contested");
  });

  it("tension=CONTESTED LEAD (amber)", () => {
    expect(m.tension?.label).toBe("CONTESTED LEAD");
    expect(m.tension?.colour).toBe("amber");
  });

  it("skewScore=64, skewLabel=Leaning Constructive", () => {
    expect(m.skewScore).toBe(64);
    expect(m.skewLabel).toBe("Leaning Constructive");
  });

  it("conviction approx 0.033", () => {
    expect(m.conviction).toBeCloseTo(0.033, 2);
    expect(m.convictionLabel).toBe("Uninformative");
  });
});

// ── TECHCO end-to-end (computeAllMetrics) ─────────────────────────────────────

describe("TECHCO_FIXTURE computeAllMetrics", () => {
  const m = computeAllMetrics(TECHCO_FIXTURE);

  it("dominance=Leading", () => {
    expect(m.dominance).toBe("Leading");
  });

  it("tension=null", () => {
    expect(m.tension).toBeNull();
  });

  it("skewScore=75, skewLabel=Constructive", () => {
    expect(m.skewScore).toBe(75);
    expect(m.skewLabel).toBe("Constructive");
  });

  it("T1 is lead, p=0.55, arrow=UP (p_prior=null uses 1/3, delta=0.217>0.03)", () => {
    expect(m.sorted[0].code).toBe("T1");
    expect(m.statuses["T1"].arrow).toBe("UP");
  });
});

// ── DIFFUSE end-to-end (computeAllMetrics) ────────────────────────────────────

describe("DIFFUSE_FIXTURE computeAllMetrics", () => {
  const m = computeAllMetrics(DIFFUSE_FIXTURE);

  it("5 hypotheses in sorted", () => {
    expect(m.sorted).toHaveLength(5);
  });

  it("sorted[0]=T1 with p=0.22", () => {
    expect(m.sorted[0].code).toBe("T1");
    expect(m.sorted[0].p).toBeCloseTo(0.22, 2);
  });

  it("all arrows FLAT (all |deltas| = 0.00-0.02 < 0.03)", () => {
    const allFlat = Object.values(m.statuses).every(s => s.arrow === "FLAT");
    expect(allFlat).toBe(true);
  });

  it("dominance=Contested (gap=0.01 < 0.08)", () => {
    expect(m.dominance).toBe("Contested");
  });

  it("tension=null (lead.p=0.22<0.30, all deltas<0.05, not BEAR lead)", () => {
    expect(m.tension).toBeNull();
  });

  it("conviction near 0 (< 0.005)", () => {
    expect(m.conviction).toBeLessThan(0.005);
    expect(m.convictionLabel).toBe("Uninformative");
  });
});
