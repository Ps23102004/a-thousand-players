import { patchNotesToTuning } from "@/ai";
import { aiRoute } from "@/lib/ai-route";
import { loadSample } from "@/lib/samples";

export async function POST(req: Request) {
  return aiRoute(req, "notes", (notes) => patchNotesToTuning(notes), { route: "balance", sample: loadSample("balance") });
}
