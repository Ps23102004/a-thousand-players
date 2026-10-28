// Session seeding shared by the crowd worker, inspect tool and replay tokens.
import { hashString } from './sim.mjs';
export function roundSeed(pid, round, base) { return 100000 + (hashString(`${pid}:${round}:${base}`) % 900000); }
export function fighterFor(pid) { return hashString(pid) % 2 ? 'rook' : 'kai'; }
