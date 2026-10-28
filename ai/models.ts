import { Agent, setGlobalDispatcher } from "undici";
import { recordUsage } from "./usage";

export const NANO = "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B";
export const SUPER = "nvidia/nemotron-3-super-120b-a12b";
export const ULTRA = "nvidia/Nemotron-3-Ultra-550b-a55b";
export const VL = "nvidia/Nemotron-3.5-Super-VL";

const BASE_URL = "https://api.tokenfactory.nebius.com/v1/chat/completions";

// Ultra can take more than 5 minutes on a 300K-token prompt; Node's default fetch gives up at 5.
setGlobalDispatcher(new Agent({ headersTimeout: 15 * 60_000, bodyTimeout: 15 * 60_000 }));

export interface ChatOpts {
  model: string;
  system?: string;
  user: string;
  images?: string[];          // PNG or JPEG base64 without the data: prefix
  maxTokens: number;
  temperature?: number;
  thinking?: boolean;         // false sends chat_template_kwargs.enable_thinking=false
  timeoutMs?: number;
  retries?: number;
}

export interface ChatResult { content: string; reasoning: string | null; tokensIn: number; tokensOut: number; ms: number; finishReason: string | null }

export class HttpError extends Error {
  constructor(public status: number, body: string) { super(`HTTP ${status}: ${body.slice(0, 300)}`); }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** "try again in 12 seconds" style hints in 429 bodies; falls back to exponential backoff. */
export function retryDelayMs(status: number, body: string, attempt: number): number {
  const m = /(\d+(?:\.\d+)?)\s*(ms|milliseconds?|s|sec|seconds?)\b/i.exec(body);
  if (status === 429 && m) {
    const n = Number(m[1]);
    return Math.min(120_000, (m[2].toLowerCase().startsWith("m") ? n : n * 1000) + 500);
  }
  return Math.min(60_000, 1000 * 2 ** attempt) + Math.floor(Math.random() * 500);
}

export async function chat(o: ChatOpts): Promise<ChatResult> {
  const key = process.env.NEBIUS_API_KEY;
  if (!key) throw new Error("NEBIUS_API_KEY is not set (run with npx tsx --env-file=.env)");
  const userContent = o.images?.length
    ? [{ type: "text", text: o.user }, ...o.images.map((b64) => ({ type: "image_url", image_url: { url: `data:image/${b64.startsWith("/9j/") ? "jpeg" : "png"};base64,${b64}` } }))]
    : o.user;
  const body: Record<string, unknown> = {
    model: o.model,
    messages: [...(o.system ? [{ role: "system", content: o.system }] : []), { role: "user", content: userContent }],
    max_tokens: o.maxTokens,
    temperature: o.temperature ?? 0.2,
  };
  if (o.thinking === false) body.chat_template_kwargs = { enable_thinking: false };

  const retries = o.retries ?? 4;
  for (let attempt = 0; ; attempt++) {
    const t0 = Date.now();
    let res: Response;
    try {
      res = await fetch(BASE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
        signal: o.timeoutMs ? AbortSignal.timeout(o.timeoutMs) : undefined,
      });
    } catch (err) {
      // A caller-imposed timeout is final; network blips are retried.
      if ((err as Error).name === "TimeoutError" || attempt >= retries) throw err;
      await sleep(retryDelayMs(0, "", attempt));
      continue;
    }
    if (!res.ok) {
      const text = await res.text();
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        await sleep(retryDelayMs(res.status, text, attempt));
        continue;
      }
      throw new HttpError(res.status, text);
    }
    const json = (await res.json()) as {
      choices: { message: { content: string | null; reasoning_content?: string | null; reasoning?: string | null }; finish_reason: string | null }[];
      usage?: { prompt_tokens: number; completion_tokens: number };
    };
    const msg = json.choices?.[0]?.message;
    const tokensIn = json.usage?.prompt_tokens ?? 0;
    const tokensOut = json.usage?.completion_tokens ?? 0;
    recordUsage(o.model, tokensIn, tokensOut);
    return {
      content: msg?.content ?? "",
      reasoning: msg?.reasoning_content ?? msg?.reasoning ?? null,
      tokensIn, tokensOut, ms: Date.now() - t0,
      finishReason: json.choices?.[0]?.finish_reason ?? null,
    };
  }
}

/** Runs fn over items with at most `concurrency` in flight; results keep input order. */
export async function pool<T, R>(items: T[], concurrency: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return out;
}

/** Content of the LAST fenced block that holds JSON (Ultra sometimes leaks reasoning with earlier drafts), else the first {...} or [...] span. */
export function extractJson(text: string): unknown {
  const fences = [...text.matchAll(/```\w*\s*([\s\S]*?)```/g)].map((m) => m[1].trim()).filter((s) => /^[[{]/.test(s));
  if (fences.length) return JSON.parse(fences[fences.length - 1]);
  const start = text.search(/[[{]/);
  if (start < 0) throw new Error("no JSON found in model output");
  const close = text[start] === "[" ? "]" : "}";
  return JSON.parse(text.slice(start, text.lastIndexOf(close) + 1));
}
