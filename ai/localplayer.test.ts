import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Observation } from '../lib/types';
import { createLocalChooser, type LocalChooser } from './localplayer';
import { buildSystemPrompt, buildUserPrompt, obsKey } from './spotlight';

const sampleObs: Observation = {
  t: 1.0,
  dist: 1.5,
  persona: {
    archetype: 'casual',
    aggression: 0.5,
    skill: 0.5,
    bio: 'A casual player exploring the fight.'
  },
  me: {
    hp: 100,
    posture: 0,
    x: -1,
    state: 'IDLE',
    facing: 1,
    guarding: false,
    grappled: false,
    onGround: true
  },
  rival: {
    hp: 95,
    posture: 10,
    x: 0.5,
    state: 'IDLE',
    facing: -1,
    guarding: false,
    grappled: false,
    onGround: true
  },
  recent: ['advance']
};

test('createLocalChooser sends correct Ollama request body and prompt', async () => {
  let capturedUrl = '';
  let capturedOptions: RequestInit | undefined;

  const mockFetch: typeof fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedOptions = init;
    return new Response(JSON.stringify({
      model: 'gemma4:e4b-mlx',
      message: { role: 'assistant', content: 'punch' }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const chooser: LocalChooser = createLocalChooser({
    fetchFn: mockFetch,
    model: 'gemma4:e4b-mlx'
  });

  const res = await chooser.choose(sampleObs);
  assert.equal(res.action, 'punch');
  assert.equal(res.fallback, false);
  assert.equal(capturedUrl, 'http://localhost:11434/api/chat');
  assert.equal(capturedOptions?.method, 'POST');

  const body = JSON.parse(String(capturedOptions?.body));
  assert.equal(body.model, 'gemma4:e4b-mlx');
  assert.equal(body.stream, false);
  assert.equal(body.options.temperature, 0.5);
  assert.ok(typeof body.options.num_predict === 'number');
  assert.deepEqual(body.messages, [
    { role: 'system', content: buildSystemPrompt(sampleObs.persona) },
    { role: 'user', content: buildUserPrompt(sampleObs) }
  ]);
});

test('createLocalChooser caches successful actions by obsKey', async () => {
  let callCount = 0;
  const mockFetch: typeof fetch = async () => {
    callCount++;
    return new Response(JSON.stringify({
      model: 'gemma4:e4b-mlx',
      message: { role: 'assistant', content: 'kick' }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const chooser = createLocalChooser({ fetchFn: mockFetch });
  const res1 = await chooser.choose(sampleObs);
  const res2 = await chooser.choose(sampleObs);

  assert.equal(res1.action, 'kick');
  assert.equal(res2.action, 'kick');
  assert.equal(callCount, 1);
  assert.equal(chooser.stats.calls, 1);
  assert.equal(chooser.stats.cacheHits, 1);
});

test('createLocalChooser falls back to wait on server errors or invalid action', async () => {
  const failingFetch: typeof fetch = async () => {
    throw new Error('Connection refused');
  };

  const chooser1 = createLocalChooser({ fetchFn: failingFetch });
  const res1 = await chooser1.choose(sampleObs);
  assert.equal(res1.action, 'wait');
  assert.equal(res1.fallback, true);
  assert.equal(chooser1.stats.fallbacks, 1);

  const invalidActionFetch: typeof fetch = async () => {
    return new Response(JSON.stringify({
      message: { role: 'assistant', content: 'nonsense_not_an_action' }
    }), { status: 200 });
  };

  const chooser2 = createLocalChooser({ fetchFn: invalidActionFetch });
  const res2 = await chooser2.choose(sampleObs);
  assert.equal(res2.action, 'wait');
  assert.equal(res2.fallback, true);
  assert.equal(chooser2.stats.fallbacks, 1);

  // Fallbacks must NOT be cached
  const res3 = await chooser2.choose(sampleObs);
  assert.equal(chooser2.stats.calls, 2);
  assert.equal(chooser2.stats.fallbacks, 2);
  assert.equal(chooser2.stats.cacheHits, 0);
});
