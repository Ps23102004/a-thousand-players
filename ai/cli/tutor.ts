// Offline producer: no server route. --results-from never calls a model.
import { readFileSync, writeFileSync } from 'node:fs';
import { buildStruggleTable, tutorPrompt, validateAids, measureAids } from '../tutor';
import { extractGameText } from '../../lib/advisor';
import { runProphet } from '../../lib/prophet';
import { chat, extractJson, SUPER } from '../models';
import type { Persona, RunLine, SessionEnd, TuningSpec } from '../../lib/types';

const read = (path:string) => readFileSync(path,'utf8');
const args = process.argv.slice(2);
if (args.some((a,i) => a !== '--dry-run' && a !== '--results-from' && args[i-1] !== '--results-from') || (args.includes('--results-from') && (!args[args.indexOf('--results-from')+1] || args.includes('--dry-run')))) throw new Error('Usage: node --import tsx ai/cli/tutor.ts [--dry-run | --results-from FILE]');
const people = JSON.parse(read('data/run-main/personas.json')) as Persona[];
const runs = read('data/run-main/runs.jsonl').trim().split('\n').map(line=>JSON.parse(line) as RunLine);
const sessions = JSON.parse(read('data/run-main/sessions.json')) as SessionEnd[];
const specs = JSON.parse(read('data/baseline-tuning.json')) as TuningSpec[];
const table = buildStruggleTable(people,runs,sessions);
const gameText = [...extractGameText(read('game/index.html'), ''), read('game/README.md')].join('\n');
const prompt = tutorPrompt(table,specs,gameText);
if (args.includes('--dry-run')) {
  console.log(JSON.stringify({struggleTable:table,promptCharacters:prompt.system.length+prompt.user.length},null,2));
} else {
  const started = Date.now();
  const imported = args.includes('--results-from');
  const text = imported ? read(args[args.indexOf('--results-from')+1]) : (await chat({model:SUPER, ...prompt, maxTokens:3000, thinking:false, retries:0})).content;
  const validated = validateAids(extractJson(text),table,specs,gameText);
  const aids = await measureAids(validated.aids,runProphet);
  const result = {placeholder:false, source:imported?'imported':'model', struggleTable:table, ...validated, aids, wallMs:Date.now()-started};
  writeFileSync('data/tutor/results.json',JSON.stringify(result,null,2)+'\n');
  console.log(`Saved ${aids.length} measured aids; ${Object.values(validated.dropped).reduce((a,b)=>a+b,0)} dropped; ${result.wallMs} ms.`);
}
