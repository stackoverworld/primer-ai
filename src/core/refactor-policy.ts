import type { ProjectShape } from "./types.js";
import type { RefactorPolicy } from "./refactor-policy/contracts.js";

import { detectSignals } from "./refactor-policy/signals.js";
import { BASELINE_REFACTOR_SKILL, buildStackSkillRecommendations } from "./refactor-policy/skills.js";
import { dedupeVerificationCommands, inferStackVerificationCommands, inferVerificationCommands } from "./refactor-policy/verification.js";

export type { RefactorPolicy, RefactorSkillRecommendation } from "./refactor-policy/contracts.js";
export { inferVerificationCommands };

export function buildRefactorPolicy(techStack: string, projectShape: ProjectShape): RefactorPolicy {
  const signals = detectSignals(techStack);
  const { stackSkills, notes } = buildStackSkillRecommendations(signals, projectShape);

  return {
    baselineSkill: BASELINE_REFACTOR_SKILL,
    stackSkills,
    verificationCommands: dedupeVerificationCommands(inferStackVerificationCommands(signals, projectShape)),
    notes
  };
}
