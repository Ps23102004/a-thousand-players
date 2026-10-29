import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { createRequire } from 'node:module';
const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as { renderToStaticMarkup: (node: React.ReactNode) => string };
import { TutorContent } from '../app/modes/onboarding/results';
import type { TutorResults } from './tutor';
const table = [{archetype:'casual',players:2,rounds:3,wins:1,winRate:1/3,quits:1,quitRate:.5,round2Count:1,medianRound2Seconds:8}];
test('placeholder and measured results show their evidence and limitations', () => {
  const placeholder = renderToStaticMarkup(createElement(TutorContent,{data:{placeholder:true,struggleTable:table,aids:[]}}));
  assert.match(placeholder,/not run yet/i); assert.match(placeholder,/casual/);
  const side = {rounds:2,wins:1,winRate:.5,bugRounds:1,byArchetype:[{archetype:'casual',rounds:2,wins:1,winRate:.5,bugRounds:1}]};
  const data = {placeholder:false,source:'imported',struggleTable:table,aids:[{aid:{title:'Guard',playerFacingText:'Hold away',rationale:'casual',archetype:'casual',tuningOverrides:{x:2}},measurement:{before:side,after:side,personas:2,roundsEach:1,seed:1,wallMs:10,tuning:{x:2},baselineTuning:{}}}]} as TutorResults;
  const html = renderToStaticMarkup(createElement(TutorContent,{data}));
  assert.match(html,/Hold away/); assert.match(html,/50\.0%/); assert.match(html,/NOT re-simulated/); assert.match(html,/within noise/); assert.match(html,/imported/i);
});
