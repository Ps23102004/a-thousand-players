// Mutable rule constants that were previously hardcoded in combat.js / ai.js.
// Defaults reproduce the shipped game exactly; the sparring engine overrides them per simulation (Balance mode).
export const RULES = { guardDamageMultiplier: 0.2, postureOnBlock: 15, postureOnHit: 7.5, staggerKnockdownLoad: 2.65, decisionDelayMin: 0.18 };
export const RULE_DEFAULTS = Object.freeze({ ...RULES });
