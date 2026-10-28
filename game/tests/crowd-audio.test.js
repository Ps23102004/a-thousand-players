import { describe, it, expect } from 'vitest';
import { createTownfolkCrowd, handleCombatEventForCrowd, updateCrowd } from '../src/crowd.js';
import { initAudio, playSound } from '../src/audio.js';
import * as THREE from 'three';

describe('Reactive Townfolk Bystanders & Audio System', () => {
  it('creates an audience attached to its scene group with idle animations', () => {
    const scene = new THREE.Scene();
    const crowd = createTownfolkCrowd(scene);

    expect(crowd).toBeDefined();
    expect(crowd.members.length).toBeGreaterThanOrEqual(8);
    expect(crowd.members[0].mesh.parent).toBe(crowd.group);
    expect(crowd.group.parent).toBe(scene);
    expect(crowd.members[0].animState).toBe('IDLE');
  });

  it('triggers cheer animation state across crowd when combo milestone >= 3 occurs', () => {
    const scene = new THREE.Scene();
    const crowd = createTownfolkCrowd(scene);

    handleCombatEventForCrowd(crowd, { type: 'COMBO_3' });
    expect(crowd.members[0].animState).toBe('CHEER');
    expect(crowd.members[1].animState).toBe('CHEER');
  });

  it('triggers gasp and scramble back when a heavy prop or cart is shattered nearby', () => {
    const scene = new THREE.Scene();
    const crowd = createTownfolkCrowd(scene);

    handleCombatEventForCrowd(crowd, { type: 'CART_SMASH', x: -3.0 });
    // Members closest to smash position should enter SCATTER or GASP
    const reacting = crowd.members.filter(m => m.animState === 'GASP' || m.animState === 'SCATTER');
    expect(reacting.length).toBeGreaterThan(0);
  });

  it('initializes procedural Web Audio engine and handles sound dispatches safely', () => {
    const audio = initAudio();
    expect(audio).toBeDefined();
    expect(typeof audio.play).toBe('function');

    // Safe execution in test environment without throwing
    expect(() => {
      playSound('hit');
      playSound('parry');
      playSound('cart_smash');
      playSound('cheer');
      playSound('gasp');
    }).not.toThrow();
  });
});
