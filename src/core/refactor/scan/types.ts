import type { RefactorFileInsight } from "../contracts.js";

export interface PackageSignals {
  hasPackageJson: boolean;
  hasTypescript: boolean;
  hasBin: boolean;
  dependencies: Set<string>;
}

export interface AnalyzedFile extends RefactorFileInsight {
  moduleKey: string;
  relativeImports: string[];
}
