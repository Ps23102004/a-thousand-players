// Mutable rule constants that were previously hardcoded in combat.js / ai.js.
// Defaults reproduce the shipped game exactly; the sparring engine overrides them per simulation (Balance mode).
export const RULES = { guardDamageMultiplier: 0.2, postureOnBlock: 15, postureOnHit: 7.5, staggerKnockdownLoad: 2.65, decisionDelayMin: 0.18,
  // 1 = mount release avoids crates and wakes the bodies; 0 = the original behavior, so rounds recorded before the fix replay as recorded.
  mountReleaseFix: 1,
  // 1 = throwProp skips a crate that broke while carried (bug3, Ultra's verified patch); 0 = original behavior, which crashes Rapier.
  throwPropGuard: 1,
  // 1 = a fighter released from a grab gets its contacts refreshed (docs/bug-hunt.md: bug2's sink-and-eject after a throw).
  grabReleaseFix: 1,
  // 1 = a knockdown also ends once the body is at rest, so landing on a crate no longer stays in KNOCKDOWN forever (bug4, H3).
  knockdownOnPropFix: 1,
  // 1 = refresh floor contacts when getting up near an intact prop, preventing a sink-and-eject; 0 = original behavior.
  getupCrateFix: 1,
  // Probability that the CPU crouch-blocks when it blocks a crouch attack (bug hunt H2: crouch + jab spam wins every round).
  // 0 = the shipped CPU, which only blocks standing; an optional rule for Balance mode, not on by default.
  cpuLowBlock: 0 };
export const RULE_DEFAULTS = Object.freeze({ ...RULES });
