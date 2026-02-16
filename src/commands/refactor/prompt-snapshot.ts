import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function writePromptSnapshot(targetDir: string, prompt: string, passNumber = 1): Promise<string> {
  const promptDir = join(targetDir, ".primer-ai");
  await mkdir(promptDir, { recursive: true });
  const promptName =
    passNumber <= 1
      ? "refactor-prompt.generated.txt"
      : `refactor-prompt.pass-${String(passNumber).padStart(2, "0")}.generated.txt`;
  const promptPath = join(promptDir, promptName);
  await writeFile(promptPath, `${prompt.trimEnd()}\n`, "utf8");
  return promptPath;
}

export function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
