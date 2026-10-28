import { bugReportToOracle } from "@/ai";
import { aiRoute } from "@/lib/ai-route";
import { findOracleMatches } from "@/lib/data";

// Super writes the oracle (the only model call); plain code then runs it over every recorded round.
export async function POST(req: Request) {
  return aiRoute(req, "report", async (report) => {
    const oracle = await bugReportToOracle(report);
    return { oracle, ...findOracleMatches(oracle) };
  });
}
