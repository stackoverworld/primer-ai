import type { AgentTarget, AiProvider } from "../types.js";
import type { CommandResult, StatusCallback } from "./contracts.js";
import { chooseProvider } from "./provider-selection.js";
import type { ResolvedAiProvider } from "./provider-selection.js";
import { startLiveStatus } from "./status.js";

export interface AiExecutionOptions {
  cwd?: string;
  onStatus?: (message: string) => void;
  existingContext?: string[];
}

type ProviderResolution =
  | {
      provider: ResolvedAiProvider;
    }
  | {
      provider: null;
      warning: string;
    };

export function resolveProviderForTask(options: {
  provider: AiProvider;
  targetAgent: AgentTarget;
  onStatus: StatusCallback | undefined;
  warningMessage: string;
}): ProviderResolution {
  options.onStatus?.("Checking available AI CLIs...");
  const provider = chooseProvider(options.provider, options.targetAgent);
  if (!provider) {
    return {
      provider: null,
      warning: options.warningMessage
    };
  }
  return { provider };
}

export async function runWithLiveStatus<T>(
  provider: ResolvedAiProvider,
  onStatus: StatusCallback | undefined,
  runTask: () => Promise<T>
): Promise<T> {
  const stopLiveStatus = startLiveStatus(provider, onStatus);
  try {
    return await runTask();
  } finally {
    stopLiveStatus();
  }
}

export function combineOutput(result: CommandResult): string {
  return `${result.stdout}\n${result.stderr}`.trim();
}
