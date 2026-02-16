import { basename, resolve } from "node:path";

import { confirm, log, outro, select, text } from "@clack/prompts";

import { decideQuickSetupPrompt } from "../quick-setup.js";
import { toKebabCase } from "../text.js";
import type { AgentTarget, AiProvider, GenerationMode, InitCommandOptions, InitInput, ProjectShape } from "../types.js";
import { POPULAR_STACKS, type StackChoice } from "./constants.js";
import { unwrapPrompt } from "./interaction.js";
import {
  inferProviderFromTarget,
  normalizeMode,
  normalizeModel,
  normalizeProvider,
  normalizeShape,
  normalizeStackChoice,
  normalizeTarget
} from "./normalization.js";
import { promptForProviderModel } from "./provider-model-prompt.js";
import { detectExistingProject, detectExistingProjectStack } from "./stack-detection.js";

async function collectInitInput(targetPath: string, options: InitCommandOptions): Promise<InitInput> {
  const normalizedPath = resolve(targetPath);
  const folderName = basename(normalizedPath);
  const defaultProjectName = toKebabCase(folderName || "new-project") || "new-project";
  const existingProject = await detectExistingProject(normalizedPath);
  const detectedStack = existingProject && !options.stack?.trim() ? await detectExistingProjectStack(normalizedPath) : null;
  const requestedMode = normalizeMode(options.mode);
  const explicitProvider = normalizeProvider(options.provider);
  const explicitModel = normalizeModel(options.model);
  const explicitTarget = normalizeTarget(options.agent) ?? "codex";
  const defaultTarget = explicitTarget;
  const defaultProvider = explicitProvider ?? inferProviderFromTarget(defaultTarget);
  const defaultModel = defaultProvider === "auto" ? undefined : explicitModel;

  if (existingProject && requestedMode === "template") {
    throw new Error("Template mode is disabled for non-empty projects. Use AI-assisted mode for migration/setup.");
  }

  const defaultMode = existingProject ? "ai-assisted" : (requestedMode ?? "ai-assisted");

  const defaults: InitInput = {
    projectName: defaultProjectName,
    description:
      options.description?.trim() ||
      `Build ${defaultProjectName} with an agent-optimized architecture and reproducible delivery workflow.`,
    techStack: options.stack?.trim() || detectedStack?.stack || "TypeScript + Node.js",
    existingProject,
    projectShape: normalizeShape(options.projectType) ?? "api-service",
    targetAgent: defaultTarget,
    includeCursorRules: options.cursor ?? false,
    generationMode: defaultMode,
    aiProvider: defaultProvider,
    ...(defaultModel ? { aiModel: defaultModel } : {}),
    initializeGit: options.gitInit ?? true,
    runAiQuickSetup: options.quickSetup ?? false
  };

  if (options.yes) {
    const aiModel = defaults.aiProvider === "auto" ? undefined : defaults.aiModel;
    if (defaults.aiProvider === "auto" && explicitModel) {
      log.warn("Ignoring --model because provider is auto. Use --provider codex|claude to pin a model.");
    }
    const quickDecision = decideQuickSetupPrompt(
      normalizedPath,
      defaults.techStack,
      defaults.projectShape,
      existingProject
    );
    const quickSetupEnabled =
      defaults.generationMode === "ai-assisted" && defaults.runAiQuickSetup && quickDecision.offer;
    const result: InitInput = {
      ...defaults,
      runAiQuickSetup: quickSetupEnabled
    };
    if (aiModel) {
      result.aiModel = aiModel;
    }
    return result;
  }

  if (existingProject) {
    const source = detectedStack?.source ?? "fallback default";
    log.info(`Detected tech stack: ${defaults.techStack} (${source})`);
  }

  const projectNameInput = unwrapPrompt<string>(
    await text({
      message: "Project name",
      placeholder: defaultProjectName,
      defaultValue: defaults.projectName,
      validate(value) {
        const resolved = value?.trim() || defaults.projectName.trim();
        if (!resolved) return "Project name is required.";
        return undefined;
      }
    })
  );
  const projectName = projectNameInput.trim() || defaults.projectName;

  const descriptionInput = unwrapPrompt<string>(
    await text({
      message: "What are you building?",
      placeholder: defaults.description,
      defaultValue: defaults.description,
      validate(value) {
        const resolved = value?.trim() || defaults.description.trim();
        if (resolved.length < 12) return "Please provide a bit more detail.";
        return undefined;
      }
    })
  );
  const description = descriptionInput.trim() || defaults.description;

  let techStack = defaults.techStack.trim();
  if (!existingProject) {
    const initialStackChoice = normalizeStackChoice(defaults.techStack);
    const selectedStack = unwrapPrompt<StackChoice>(
      await select({
        message: "Primary tech stack",
        initialValue: initialStackChoice,
        options: [
          ...POPULAR_STACKS.map((stack) => ({ value: stack, label: stack })),
          { value: "other", label: "Other (type manually)" }
        ]
      })
    );

    techStack = selectedStack;
    if (selectedStack === "other") {
      const customStackDefault = initialStackChoice === "other" ? defaults.techStack.trim() : "";
      const customStackInput = unwrapPrompt<string>(
        await text({
          message: "Custom tech stack",
          placeholder: "e.g. Elixir + Phoenix",
          defaultValue: customStackDefault,
          validate(value) {
            const resolved = value?.trim() || customStackDefault;
            if (!resolved) return "Tech stack is required.";
            return undefined;
          }
        })
      );
      techStack = customStackInput.trim() || customStackDefault;
    }
  }

  const projectShape = unwrapPrompt<ProjectShape>(
    await select({
      message: "Project shape",
      initialValue: defaults.projectShape,
      options: [
        { value: "web-app", label: "Web app" },
        { value: "api-service", label: "API service" },
        { value: "library", label: "Library" },
        { value: "cli-tool", label: "CLI tool" },
        { value: "monorepo", label: "Monorepo" },
        { value: "custom", label: "Custom" }
      ]
    })
  );

  const targetAgent = unwrapPrompt<AgentTarget>(
    await select({
        message: "Primary coding assistant workflow",
        initialValue: defaults.targetAgent,
        options: [
          { value: "codex", label: "Codex CLI (recommended)" },
          { value: "both", label: "Both (Codex + Claude)" },
          { value: "claude", label: "Claude Code" }
        ]
      })
    );

  const generationMode = existingProject
    ? "ai-assisted"
    : unwrapPrompt<GenerationMode>(
        await select({
          message: "Draft docs with installed agent CLI?",
          initialValue: defaults.generationMode,
          options: [
            {
              value: "ai-assisted",
              label: "AI-assisted (Codex-first; Claude fallback when selected)"
            },
            { value: "template", label: "Template-only (fully local deterministic scaffold)" }
          ]
        })
      );

  let aiProvider = defaults.aiProvider;
  let aiModel = defaults.aiModel;
  if (generationMode === "ai-assisted") {
    const providerInitialValue = explicitProvider ?? inferProviderFromTarget(targetAgent);
    aiProvider = unwrapPrompt<AiProvider>(
      await select({
        message: "AI provider preference",
        initialValue: providerInitialValue,
        options: [
          { value: "codex", label: "Codex CLI (recommended)" },
          { value: "auto", label: "Auto-detect (prefer Codex, fallback Claude)" },
          { value: "claude", label: "Claude Code" }
        ]
      })
    );

    if (aiProvider === "auto") {
      if (explicitModel) {
        log.warn("Ignoring --model because provider is auto. Use provider codex|claude to pin a model.");
      }
      aiModel = undefined;
    } else if (explicitModel) {
      aiModel = explicitModel;
    } else {
      aiModel = await promptForProviderModel(aiProvider, normalizedPath);
    }
  } else {
    aiProvider = "auto";
    aiModel = undefined;
  }

  const includeCursorRules = unwrapPrompt<boolean>(
    await confirm({
      message: "Generate .cursor/rules files?",
      initialValue: defaults.includeCursorRules
    })
  );

  const initializeGit = unwrapPrompt<boolean>(
    await confirm({
      message: "Initialize git repository if missing?",
      initialValue: defaults.initializeGit
    })
  );

  let runAiQuickSetup = false;
  if (generationMode === "ai-assisted") {
    const quickDecision = decideQuickSetupPrompt(normalizedPath, techStack.trim(), projectShape, existingProject);
    if (quickDecision.offer) {
      const quickSetupLabel = quickDecision.support.label ?? quickDecision.support.preset ?? "selected stack";
      runAiQuickSetup = unwrapPrompt<boolean>(
        await confirm({
          message: `Run AI quick setup for ${quickSetupLabel} (install deps + starter scripts)?`,
          initialValue: defaults.runAiQuickSetup
        })
      );
    } else if (existingProject && quickDecision.support.supported) {
      log.info(`Skipping AI quick setup prompt: ${quickDecision.reason}`);
    }
  }

  outro("Configuration captured.");

  return {
    projectName: toKebabCase(projectName) || defaults.projectName,
    description: description.trim(),
    techStack: techStack.trim(),
    existingProject: defaults.existingProject,
    projectShape,
    targetAgent,
    includeCursorRules,
    generationMode,
    aiProvider,
    ...(aiModel ? { aiModel } : {}),
    initializeGit,
    runAiQuickSetup
  };
}

export { collectInitInput };
