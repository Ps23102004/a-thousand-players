// Public surface of the AI layer (Nemotron on Nebius Token Factory + Tavily). Other code imports ONLY from this file.
// Signatures are fixed by the lead; implementations live in the focused files below. Settings and measurements: ai/README.md.
export { generatePersonas } from "./personas";
export { buildCorpus } from "./corpus";
export { analyzeCrowd } from "./report";
export { attachPrecedent } from "./precedent";
export { bugReportToOracle, patchNotesToTuning } from "./nl";
export { describeFrames } from "./vision";
export { triageBug } from "./triage";
export type { BugCluster, Patch, Triage, TriageOpts } from "./triage";
export { chooseAction } from "./spotlight";
export { getUsage } from "./usage";
