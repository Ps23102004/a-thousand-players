import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, visionOpinion } from './cli.mjs';
test('CLI defaults, explicit options, and rejection before browser launch', () => {
  assert.deepEqual(parseArgs(['http://localhost/game']), { url: 'http://localhost/game', seconds: 60, seed: 1, out: 'reports/blackbox', vision: false });
  assert.deepEqual(parseArgs(['https://example.test', '--seconds', '20', '--seed', '0', '--out', 'reports/a', '--vision']), { url: 'https://example.test', seconds: 20, seed: 0, out: 'reports/a', vision: true });
  for (const args of [[], ['file:///secret'], ['http://x', '--seconds', '-1'], ['http://x', '--seed', 'NaN'], ['http://x', '--seed', '1.5'], ['http://x', '--out'], ['http://x', '--wat']]) assert.throws(() => parseArgs(args));
});
test('CLI --seconds rejects values above the one-hour cap with a clear error', () => {
  for (const seconds of ['3601', '3600.1', '2147484', '1e12']) {
    assert.throws(() => parseArgs(['http://fixture/game', '--seconds', seconds]), /seconds must be between 1 and 3600/i);
  }
});
test('CLI --seconds rejects values below one second and non-finite values with a clear error', () => {
  for (const seconds of ['0', '-1', '0.5', 'NaN', 'Infinity']) {
    assert.throws(() => parseArgs(['http://fixture/game', '--seconds', seconds]), /seconds must be between 1 and 3600/i);
  }
});
test('CLI --seconds accepts both inclusive bounds and finite values between them', () => {
  for (const seconds of [1, 1.5, 3600]) {
    assert.equal(parseArgs(['http://fixture/game', '--seconds', String(seconds)]).seconds, seconds);
  }
});
test('vision sends exactly three real frames to a fake chat; short runs remain inconclusive', async () => {
  let calls = 0;
  const chat = async opts => { calls++; assert.equal(opts.model, 'fake-vl'); assert.equal(opts.images.length, 3); assert.deepEqual(opts.images, ['a', 'c', 'e']); return { content: 'possible artifact' }; };
  assert.equal((await visionOpinion(['a', 'b'], { chat, VL: 'fake-vl' })).status, 'insufficient-frames');
  assert.equal(calls, 0);
  const result = await visionOpinion(['a', 'b', 'c', 'd', 'e'], { chat, VL: 'fake-vl' });
  assert.equal(result.secondOpinion, true);
  assert.equal(result.content, 'possible artifact');
  assert.equal(calls, 1);
});
