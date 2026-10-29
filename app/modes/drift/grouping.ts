import type { VerifiedDriftClaim } from "@/ai/drift";

export interface DriftJudgment { verdict: string; reason: string }
export interface DriftJudge {
  judge?: string;
  verdicts?: Record<string, DriftJudgment>;
}
export interface IndexedDriftClaim {
  index: number;
  claim: VerifiedDriftClaim;
  judgment?: DriftJudgment;
}

/** Judge keys refer to the original claims array, before any display grouping. */
export function groupDriftClaims(claims: VerifiedDriftClaim[], judge?: DriftJudge | null) {
  const confirmed: IndexedDriftClaim[] = [];
  const vague: IndexedDriftClaim[] = [];
  const notDrift: IndexedDriftClaim[] = [];
  const unchecked: IndexedDriftClaim[] = [];
  claims.forEach((claim, position) => {
    const index = position + 1;
    const judgment = judge?.verdicts?.[String(index)];
    const item = { index, claim, judgment };
    switch (judgment?.verdict) {
      case "REAL_DRIFT": confirmed.push(item); break;
      case "DOC_VAGUE": vague.push(item); break;
      case "NOT_DRIFT": notDrift.push(item); break;
      default: unchecked.push({ index, claim });
    }
  });
  return {
    confirmed, vague, notDrift, unchecked,
    counts: { total: claims.length, confirmed: confirmed.length, vague: vague.length, notDrift: notDrift.length, unchecked: unchecked.length },
  };
}
