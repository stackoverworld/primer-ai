import { parseDraftFromOutput, parseWithSchema } from "./ai-parsing.js";

export { generateAiDraft } from "./ai/draft-task.js";
export type { AiDraftResult } from "./ai/draft-task.js";
export { runAiFreeformTask } from "./ai/freeform-task.js";
export type { AiTaskResult } from "./ai/freeform-task.js";
export { generateAiQuickSetupPlan } from "./ai/quick-setup-task.js";
export type { AiQuickSetupResult } from "./ai/quick-setup-task.js";

export const __internal = {
  parseDraftFromOutput,
  parseWithSchema
};
