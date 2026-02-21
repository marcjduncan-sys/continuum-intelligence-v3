import type { StockModel } from "./types";
import { qualityExceedsCeiling } from "./domainCeilings";

/**
 * Validate a StockModel against eight structural rules.
 * Returns an array of human-readable error strings.
 * An empty array means the model is valid.
 * NEVER silently fixes issues.
 */
export function validate(model: StockModel): string[] {
  const errors: string[] = [];
  const { hypotheses, constructiveCodes, downsideCodes, evidence, tripwires } = model;

  // ── 1. Weight sum within 0.01 of 1.0 ──────────────────────────────────────
  const sum = hypotheses.reduce((acc, h) => acc + h.p, 0);
  if (Math.abs(sum - 1.0) > 0.01) {
    errors.push(`Weight sum ${sum} deviates from 1.0 by more than 0.01`);
  }

  // ── 2. All h.p > 0 ────────────────────────────────────────────────────────
  for (const h of hypotheses) {
    if (h.p <= 0) {
      errors.push(`Hypothesis ${h.code} has non-positive weight ${h.p}`);
    }
  }

  // ── 3. Hypothesis count 3–6 ───────────────────────────────────────────────
  const n = hypotheses.length;
  if (n < 3 || n > 6) {
    errors.push(`Hypothesis count ${n} outside allowed range 3-6`);
  }

  // ── 4. Partition: union = all codes, no overlap, no gaps ──────────────────
  const allCodes = new Set(hypotheses.map(h => h.code));
  const constructiveSet = new Set(constructiveCodes);
  const downsideSet = new Set(downsideCodes);

  // Check union equals all codes, no overlap, no missing
  let partitionValid = true;

  // Overlap check
  for (const code of constructiveCodes) {
    if (downsideSet.has(code)) {
      partitionValid = false;
      break;
    }
  }

  // Gap check: every hypothesis code must be in exactly one partition
  if (partitionValid) {
    for (const code of allCodes) {
      if (!constructiveSet.has(code) && !downsideSet.has(code)) {
        partitionValid = false;
        break;
      }
    }
  }

  // Extra codes in partition not in hypotheses
  if (partitionValid) {
    for (const code of constructiveCodes) {
      if (!allCodes.has(code)) {
        partitionValid = false;
        break;
      }
    }
  }

  if (partitionValid) {
    for (const code of downsideCodes) {
      if (!allCodes.has(code)) {
        partitionValid = false;
        break;
      }
    }
  }

  if (!partitionValid) {
    errors.push(`Constructive/downside partition does not match hypothesis codes`);
  }

  // ── 5. Partition stance consistency ───────────────────────────────────────
  const hypMap = new Map(hypotheses.map(h => [h.code, h]));

  for (const code of constructiveCodes) {
    const h = hypMap.get(code);
    if (h && h.stance === "BEARISH") {
      errors.push(`${code} has stance ${h.stance} but is in constructive partition`);
    }
  }
  for (const code of downsideCodes) {
    const h = hypMap.get(code);
    if (h && h.stance !== "BEARISH") {
      errors.push(`${code} has stance ${h.stance} but is in downside partition`);
    }
  }

  // ── 6. Every evidence.dir covers every hypothesis code ────────────────────
  for (const e of evidence) {
    for (const h of hypotheses) {
      if (!(h.code in e.dir)) {
        errors.push(`Evidence ${e.id} missing direction for hypothesis ${h.code}`);
      }
    }
  }

  // ── 7. No evidence quality exceeds its domain ceiling ────────────────────
  for (const e of evidence) {
    if (qualityExceedsCeiling(e.domain, e.quality)) {
      const ceiling = e.domain;
      errors.push(`Evidence ${e.id} has quality ${e.quality} exceeding ${e.domain} ceiling of ${ceiling}`);
    }
  }

  // ── 8. At least 2 tripwires ───────────────────────────────────────────────
  if (tripwires.length < 2) {
    errors.push(`Minimum 2 tripwires required, found ${tripwires.length}`);
  }

  return errors;
}
