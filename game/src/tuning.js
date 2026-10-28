// Mutable rule constants that were previously hardcoded in combat.js / ai.js.
// Defaults reproduce the shipped game exactly; the sparring engine overrides them per simulation (Balance mode).
export const RULES = { guardDamageMultiplier: 0.2, postureOnBlock: 15, postureOnHit: 7.5, staggerKnockdownLoad: 2.65, decisionDelayMin: 0.18,
  // 1 = mount release avoids crates and wakes the bodies; 0 = the original behavior, so rounds recorded before the fix replay as recorded.
  mountReleaseFix: 1,
  // 1 = throwProp skips a crate that broke while carried (bug3, Ultra's verified patch); 0 = original behavior, which crashes Rapier.
  throwPropGuard: 1 };
export const RULE_DEFAULTS = Object.freeze({ ...RULES });
