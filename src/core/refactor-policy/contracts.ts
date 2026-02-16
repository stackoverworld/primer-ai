export interface RefactorSkillRecommendation {
  name: string;
  repository: string;
  purpose: string;
  appliesWhen: string;
  installCommand: string;
}

export interface RefactorPolicy {
  baselineSkill: RefactorSkillRecommendation;
  stackSkills: RefactorSkillRecommendation[];
  verificationCommands: string[];
  notes: string[];
}

export interface StackSignals {
  hasTypescript: boolean;
  hasNodeMention: boolean;
  hasNodeRuntime: boolean;
  hasNext: boolean;
  hasReact: boolean;
  hasVite: boolean;
  hasRust: boolean;
  hasPython: boolean;
  hasGo: boolean;
  hasJavaOrKotlin: boolean;
  hasSwift: boolean;
  hasExpressOrFastify: boolean;
}
