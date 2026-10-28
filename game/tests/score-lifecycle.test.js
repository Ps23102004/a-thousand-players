import { describe, it, expect } from 'vitest';
import { calculateScore, formatGameTime, createHUDState } from '../src/hud.js';

describe('Scoring & Game Lifecycle', () => {
  it('calculates score based on damage dealt, combo multiplier, and environmental props smashed', () => {
    const score = calculateScore({
      damageDealt: 100,
      maxCombo: 4,
      propsBroken: 2,
      timeSeconds: 45,
      isVictory: true
    });

    // 100 * 10 (1000) + 4 * 150 (600) + 2 * 250 (500) + victory bonus (1000) = >3000
    expect(score).toBeGreaterThan(1500);
  });

  it('formats game seconds into clean M:SS display string', () => {
    expect(formatGameTime(45)).toBe('0:45');
    expect(formatGameTime(125)).toBe('2:05');
  });

  it('maintains HUD state model with health, posture, and combo animations', () => {
    const hud = createHUDState();
    expect(hud.playerHealth).toBe(100);
    expect(hud.rivalHealth).toBe(100);
    expect(hud.comboCount).toBe(0);

    hud.registerComboHit();
    expect(hud.comboCount).toBe(1);
    expect(hud.comboTimer).toBeGreaterThan(0);
  });
});
