import { chat, VL } from "./models";

export async function describeFrames(pngBase64: string[], question: string): Promise<string> {
  if (pngBase64.length < 1 || pngBase64.length > 6) throw new Error("describeFrames takes 1-6 PNG frames");
  const r = await chat({
    model: VL,
    system: "You look at frames from a 3D street fighting game replay (two fighters in a market square). Describe only what is visible; say when you cannot tell.",
    user: `${question}\n(${pngBase64.length} frame${pngBase64.length > 1 ? "s" : ""}, in time order.)`,
    images: pngBase64,
    maxTokens: 600,
    temperature: 0.2,
    thinking: false,
  });
  return r.content.trim();
}
