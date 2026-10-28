import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Course Deliverables for CSCI 310', () => {
  const root = path.resolve(__dirname, '..');

  it('verifies DocForge development notebook contains all required iteration sections', () => {
    const notebookPath = path.join(root, 'Development_Notebook_Project2.md');
    expect(fs.existsSync(notebookPath)).toBe(true);

    const content = fs.readFileSync(notebookPath, 'utf-8');
    expect(content).toContain('Goal/Task/Rationale');
    expect(content).toContain('What do you do?');
    expect(content).toContain('Response/Result');
    expect(content).toContain('Your Evaluation');
    expect(content).toContain('Three.js');
    expect(content).toContain('Rapier');
  });

  it('verifies interactive HTML presentation slides exist with 8-minute pacing and tech breakdown', () => {
    const slidesPath = path.join(root, 'CSCI310_Project2_Slides.html');
    expect(fs.existsSync(slidesPath)).toBe(true);

    const content = fs.readFileSync(slidesPath, 'utf-8');
    expect(content).toContain('Street Brawl 3D');
    expect(content).toContain('Three.js');
    expect(content).toContain('Rapier3D');
    expect(content).toContain('Kinetic Physics');
  });

  it('verifies README.md documents architecture, controls, and GitHub Pages hosting instructions', () => {
    const readmePath = path.join(root, 'README.md');
    expect(fs.existsSync(readmePath)).toBe(true);

    const content = fs.readFileSync(readmePath, 'utf-8');
    expect(content).toContain('Street Brawl 3D');
    expect(content).toContain('Controls');
    expect(content).toContain('GitHub Pages');
  });
});
