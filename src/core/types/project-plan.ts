export interface ScopedInstruction {
  directory: string;
  focus: string;
}

export interface RepositoryArea {
  path: string;
  purpose: string;
}

export interface ProjectPlan {
  directories: string[];
  scopedInstructions: ScopedInstruction[];
  repositoryAreas: RepositoryArea[];
  verificationCommands: string[];
  launchCommand: string;
}
