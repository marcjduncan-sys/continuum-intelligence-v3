import { EvidenceDomain, EvidenceQuality } from "./types";

const QUALITY_RANK: Record<EvidenceQuality, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };

const DOMAIN_CEILING: Record<EvidenceDomain, EvidenceQuality> = {
  Regulatory: "HIGH",
  Economic: "HIGH",
  Academic: "HIGH",
  Competitor: "HIGH",
  Broker: "MEDIUM",
  Governance: "MEDIUM",
  Ownership: "MEDIUM",
  Alternative: "MEDIUM",
  Corporate: "LOW",
  Media: "LOW",
};

export function qualityExceedsCeiling(domain: EvidenceDomain, quality: EvidenceQuality): boolean {
  return QUALITY_RANK[quality] > QUALITY_RANK[DOMAIN_CEILING[domain]];
}

export { DOMAIN_CEILING };
