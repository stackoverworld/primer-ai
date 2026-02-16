import { readdir } from "node:fs/promises";

import type { StackDetection } from "./constants.js";
import { STACK_DETECTORS } from "./stack-detection/detectors.js";

async function detectExistingProject(targetPath: string): Promise<boolean> {
  const entries = await readdir(targetPath);
  const meaningfulEntries = entries.filter((entry) => ![".git", ".DS_Store"].includes(entry));
  return meaningfulEntries.length > 0;
}

async function detectExistingProjectStack(targetPath: string): Promise<StackDetection | null> {
  for (const detector of STACK_DETECTORS) {
    const detected = await detector(targetPath);
    if (detected) return detected;
  }

  return null;
}

export { detectExistingProject, detectExistingProjectStack };
