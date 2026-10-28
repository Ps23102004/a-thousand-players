import type { UsageRow } from "../lib/types";

// Only Ultra has a published aggregator price, and even that is unverified. Other models report tokens only.
const PRICE_PER_M: Record<string, { in: number; out: number }> = {
  "nvidia/Nemotron-3-Ultra-550b-a55b": { in: 1, out: 3 },
};

const rows = new Map<string, UsageRow>();

export function recordUsage(model: string, tokensIn: number, tokensOut: number): void {
  const row = rows.get(model) ?? { model, calls: 0, tokensIn: 0, tokensOut: 0, usdEstimate: 0 };
  row.calls += 1;
  row.tokensIn += tokensIn;
  row.tokensOut += tokensOut;
  const price = PRICE_PER_M[model];
  row.usdEstimate = price ? (row.tokensIn * price.in + row.tokensOut * price.out) / 1e6 : 0;
  rows.set(model, row);
}

export function getUsage(): UsageRow[] {
  return [...rows.values()].map((r) => ({ ...r, usdEstimate: Math.round(r.usdEstimate * 10000) / 10000 }));
}

export const USAGE_NOTES =
  "usdEstimate is filled only for Ultra, at an UNVERIFIED aggregator price of $1/M input and $3/M output tokens. " +
  "Nano, Super and Super-VL report tokens only (usdEstimate 0) because no verified Token Factory price was available.";
