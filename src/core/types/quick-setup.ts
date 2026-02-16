import type { NodeRuntimeProfile } from "./common.js";

export interface AiQuickSetupPlan {
  includeTesting: boolean;
  includeLinting: boolean;
  includeFormatting: boolean;
  runtimeProfile?: NodeRuntimeProfile | undefined;
  notes: string[];
}
