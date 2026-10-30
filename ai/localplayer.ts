import type { Action, Observation } from '../lib/types';
import { obsKey, parseAction, buildSystemPrompt, buildUserPrompt } from './spotlight';

export interface LocalPlayerOptions {
  url?: string;
  model?: string;
  timeoutMs?: number;
  temperature?: number;
  numPredict?: number;
  fetchFn?: typeof fetch;
}

export interface LocalChooserStats {
  calls: number;
  cacheHits: number;
  fallbacks: number;
}

export interface LocalChooser {
  choose(obs: Observation): Promise<{ action: Action; fallback: boolean }>;
  stats: LocalChooserStats;
  cache: Map<string, Action>;
  model: string;
}

export function createLocalChooser(opts: LocalPlayerOptions = {}): LocalChooser {
  const cache = new Map<string, Action>();
  const stats: LocalChooserStats = { calls: 0, cacheHits: 0, fallbacks: 0 };
  const url = opts.url ?? 'http://localhost:11434/api/chat';
  const model = opts.model ?? (process.env.REPROBOT_LOCAL_MODEL || 'gemma4:e4b-mlx');
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const temperature = opts.temperature ?? 0.5;
  const numPredict = opts.numPredict ?? 6;
  const fetchFn = opts.fetchFn ?? fetch;

  async function choose(obs: Observation): Promise<{ action: Action; fallback: boolean }> {
    const key = obsKey(obs);
    const hit = cache.get(key);
    if (hit) {
      stats.cacheHits++;
      return { action: hit, fallback: false };
    }

    stats.calls++;
    const system = buildSystemPrompt(obs.persona);
    const user = buildUserPrompt(obs);

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new Error('Timeout')), timeoutMs);
      const res = await fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user }
          ],
          stream: false,
          options: {
            temperature,
            num_predict: numPredict
          }
        }),
        signal: controller.signal
      }).finally(() => clearTimeout(timer));

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { message?: { content?: string } };
      const action = parseAction(data.message?.content || '');
      if (!action) {
        stats.fallbacks++;
        return { action: 'wait', fallback: true };
      }
      if (cache.size > 5000) cache.clear();
      cache.set(key, action);
      return { action, fallback: false };
    } catch {
      stats.fallbacks++;
      return { action: 'wait', fallback: true };
    }
  }

  return { choose, stats, cache, model };
}
