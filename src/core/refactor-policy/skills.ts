import type { ProjectShape } from "../types.js";

import type { RefactorSkillRecommendation, StackSignals } from "./contracts.js";
import { isLikelyNodeBackend } from "./signals.js";

function installCommand(repository: string, skillName: string): string {
  return `npx skills add ${repository} --skill ${skillName}`;
}

export const BASELINE_REFACTOR_SKILL: RefactorSkillRecommendation = {
  name: "qa-refactoring",
  repository: "vasilyu1983/ai-agents-public",
  purpose: "Cross-language safe refactor workflow with baseline/invariants/micro-step discipline.",
  appliesWhen: "Always",
  installCommand: installCommand("vasilyu1983/ai-agents-public", "qa-refactoring")
};

const RUST_REFACTOR_SKILL: RefactorSkillRecommendation = {
  name: "rust-refactor-helper",
  repository: "zhanghandong/rust-skills",
  purpose: "Rust-specific LSP-style refactor operations with impact checks and dry-run mindset.",
  appliesWhen: "Rust stacks",
  installCommand: installCommand("zhanghandong/rust-skills", "rust-refactor-helper")
};

const REACT_NEXT_REFACTOR_SKILL: RefactorSkillRecommendation = {
  name: "vercel-react-best-practices",
  repository: "vercel-labs/agent-skills",
  purpose: "React/Next refactor guidance with performance and architecture-focused best practices.",
  appliesWhen: "Next.js or React stacks",
  installCommand: installCommand("vercel-labs/agent-skills", "vercel-react-best-practices")
};

const NODE_BACKEND_REFACTOR_SKILL: RefactorSkillRecommendation = {
  name: "nodejs-backend-patterns",
  repository: "wshobson/agents",
  purpose: "Node backend architecture patterns for service-level refactors (middleware, errors, auth boundaries).",
  appliesWhen: "Node backend stacks",
  installCommand: installCommand("wshobson/agents", "nodejs-backend-patterns")
};

const IOS_REFACTOR_SKILL: RefactorSkillRecommendation = {
  name: "ios-development",
  repository: "rshankras/claude-code-apple-skills",
  purpose: "Swift/iOS architecture and code-quality guidance for safe refactors.",
  appliesWhen: "Swift/iOS stacks",
  installCommand: installCommand("rshankras/claude-code-apple-skills", "ios-development")
};

function dedupeSkills(skills: RefactorSkillRecommendation[]): RefactorSkillRecommendation[] {
  return Array.from(new Map(skills.map((skill) => [skill.name, skill])).values());
}

export function buildStackSkillRecommendations(
  signals: StackSignals,
  projectShape: ProjectShape
): { stackSkills: RefactorSkillRecommendation[]; notes: string[] } {
  const stackSkills: RefactorSkillRecommendation[] = [];
  const notes: string[] = [];

  if (signals.hasRust) {
    stackSkills.push(RUST_REFACTOR_SKILL);
  }

  if (signals.hasNext || signals.hasReact) {
    stackSkills.push(REACT_NEXT_REFACTOR_SKILL);
  }

  if (isLikelyNodeBackend(signals, projectShape)) {
    stackSkills.push(NODE_BACKEND_REFACTOR_SKILL);
  }

  if (signals.hasSwift) {
    stackSkills.push(IOS_REFACTOR_SKILL);
    notes.push("Install `swift-format` separately and run `swift format lint .` plus `swift test` during refactors.");
  }

  if (signals.hasNext) {
    notes.push("Use `eslint`-based lint scripts instead of `next lint` in generated workflows.");
  }

  if (signals.hasVite && signals.hasTypescript) {
    notes.push("Use `vite build` and `vitest run` for deterministic single-pass verification.");
  }

  if (signals.hasVite && signals.hasReact) {
    notes.push("Treat `react-vite-expert` as optional specialist guidance for large structural reorganizations.");
  }

  return {
    stackSkills: dedupeSkills(stackSkills),
    notes
  };
}
