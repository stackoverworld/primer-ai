import { cancel, isCancel } from "@clack/prompts";

function unwrapPrompt<T>(value: T | symbol): T {
  if (isCancel(value)) {
    cancel("Initialization canceled.");
    process.exit(1);
  }

  return value as T;
}

export { unwrapPrompt };
