import { bugReportToOracle } from "@/ai";
import { aiRoute } from "@/lib/ai-route";

export async function POST(req: Request) {
  return aiRoute(req, "report", (report) => bugReportToOracle(report));
}
