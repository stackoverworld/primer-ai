import { relative, resolve } from "node:path";

import { log } from "@clack/prompts";

import { UserInputError } from "../core/errors.js";
import { buildProjectPlan } from "../core/plan.js";
import { collectInitInput } from "../core/prompts.js";
import { rootAgentsLineCount } from "../core/templates.js";
import type { InitCommandOptions } from "../core/types.js";
import { prepareTargetDirectory } from "../core/write.js";
import { prepareInitArtifacts } from "./init/artifacts.js";
import { collectExistingContextSnippets, listMeaningfulEntries } from "./init/context.js";
import { prepareInitDraft } from "./init/draft.js";
import { runInitQuickSetup } from "./init/quick-setup.js";
import { writeInitScaffold } from "./init/scaffold-write.js";

function toDisplayPath(path: string): string {
  const rel = relative(process.cwd(), path);
  if (!rel || rel === "") return ".";
  return rel.startsWith("..") ? path : rel;
}

export async function runInit(pathArg: string | undefined, options: InitCommandOptions): Promise<void> {
  const targetDir = resolve(process.cwd(), pathArg ?? ".");
  const force = options.force ?? false;

  await prepareTargetDirectory(targetDir, force, true);
  const preexistingEntries = listMeaningfulEntries(targetDir);
  const input = await collectInitInput(targetDir, options);
  if (preexistingEntries.length > 0 && input.generationMode !== "ai-assisted") {
    throw new UserInputError("Non-empty project migration is available only in AI-assisted mode.");
  }

  const plan = buildProjectPlan(input);
  const existingContextSnippets = input.existingProject ? collectExistingContextSnippets(targetDir) : [];
  const existingContextForPrompt = existingContextSnippets.map(
    (entry) => `${entry.path}: ${entry.excerpt}`
  );

  const aiResult = await prepareInitDraft(input, plan, targetDir, existingContextForPrompt);
  const artifacts = prepareInitArtifacts({
    targetDir,
    input,
    force,
    plan,
    draft: aiResult.draft,
    ...(aiResult.providerUsed ? { providerUsed: aiResult.providerUsed } : {}),
    existingContextSnippets
  });
  const gitSummary = await writeInitScaffold({
    targetDir,
    displayPath: toDisplayPath(targetDir),
    plannedDirectories: plan.directories,
    filesToWrite: artifacts.filesToWrite,
    force,
    ...(artifacts.mergedReadme ? { allowOverwritePaths: new Set<string>(["README.md"]) } : {}),
    initializeGit: input.initializeGit
  });
  const quickSetupSummary = await runInitQuickSetup(input, targetDir, existingContextForPrompt);

  const lineCount = rootAgentsLineCount(artifacts.generatedFiles);
  if (lineCount < 60 || lineCount > 150) {
    log.warn(`Generated AGENTS.md is ${lineCount} lines; expected 60-150. Consider pruning or extending.`);
  }

  log.success(`Scaffold created at \`${toDisplayPath(targetDir)}\`.`);
  log.info(`Generated ${artifacts.filesToWrite.length} files across ${plan.directories.length} planned directories.`);
  log.info(gitSummary);
  if (artifacts.collisions.length > 0) {
    log.warn(
      `Preserved ${artifacts.collisions.length} existing files; generated variants use '.primer-ai.generated' suffixes.`
    );
  } else if (input.existingProject && force) {
    log.warn("Overwrote existing scaffold paths because --force was set.");
  }
  if (artifacts.mergedReadme) {
    log.info("Merged existing README.md with primer-ai managed context block.");
  }
  if (quickSetupSummary) {
    log.info(quickSetupSummary);
  }

  const targetNotes = [
    input.targetAgent === "codex" || input.targetAgent === "both" ? "Codex: `AGENTS.md` + scoped files are ready." : null,
    input.targetAgent === "claude" || input.targetAgent === "both" ? "Claude: `CLAUDE.md` and `.claude/rules/` are ready." : null,
    input.includeCursorRules ? "Cursor: `.cursor/rules/` files are ready." : null
  ].filter(Boolean);

  for (const note of targetNotes) {
    log.info(note as string);
  }
}
