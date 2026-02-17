import { describe, expect, it } from "vitest";

import { createLiveAiOutputRenderer, formatLiveAiLine, shouldSuppressLiveAiLine } from "../src/core/ai/live-output.js";

const ANSI = {
  reset: "\u001B[0m",
  green: "\u001B[32m",
  red: "\u001B[31m",
  cyan: "\u001B[36m",
  yellow: "\u001B[33m"
} as const;

describe("AI live output formatting", () => {
  it("suppresses noisy codex rollout and mcp startup lines", () => {
    expect(shouldSuppressLiveAiLine("mcp startup: no servers")).toBe(true);
    expect(
      shouldSuppressLiveAiLine(
        "2026-02-16T08:39:03.700176Z ERROR codex_core::rollout::list: state db missing rollout path for thread 123"
      )
    ).toBe(true);
    expect(shouldSuppressLiveAiLine("PRIMER_REFACTOR_STATUS: COMPLETE")).toBe(false);
  });

  it("highlights diff/file operation lines with colors", () => {
    const state = {
      inUnifiedDiff: false,
      suppressInstructionBlock: false,
      suppressShellCommandOutput: false,
      suppressNarrativeBlock: false,
      suppressApplyPatchBlock: false,
      suppressLoosePatchBlock: false,
      suppressUsageValueLine: false,
      suppressJsonBlock: false,
      jsonBraceDepth: 0,
      jsonTaskCount: 0,
      jsonLooksLikePlan: false,
      pendingDiffFile: null,
      pendingDiffType: "update" as const,
      pendingDiffStream: null,
      suppressedInstructionLines: 0,
      suppressedInstructionTitle: null,
      suppressedInstructionHasUserNotes: false,
      suppressedInstructionStream: null
    };
    const diffLine = formatLiveAiLine("diff --git a/a.ts b/a.ts", state, { colorize: true });
    const addHeader = formatLiveAiLine("+++ b/a.ts", state, { colorize: true });
    const removeHeader = formatLiveAiLine("--- a/a.ts", state, { colorize: true });
    const hunkLine = formatLiveAiLine("@@ -1,3 +1,5 @@", state, { colorize: true });
    const newFileMode = formatLiveAiLine("new file mode 100644", state, { colorize: true });
    const deletedFileMode = formatLiveAiLine("deleted file mode 100644", state, { colorize: true });

    expect(diffLine).toBe(`${ANSI.cyan}diff --git a/a.ts b/a.ts${ANSI.reset}`);
    expect(addHeader).toBe(`${ANSI.green}+++ b/a.ts${ANSI.reset}`);
    expect(removeHeader).toBe(`${ANSI.red}--- a/a.ts${ANSI.reset}`);
    expect(hunkLine).toBe(`${ANSI.yellow}@@ -1,3 +1,5 @@${ANSI.reset}`);
    expect(newFileMode).toBe(`${ANSI.green}new file mode 100644${ANSI.reset}`);
    expect(deletedFileMode).toBe(`${ANSI.red}deleted file mode 100644${ANSI.reset}`);
  });

  it("renders compact file-op events while filtering noise", () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const renderer = createLiveAiOutputRenderer({
      colorize: false,
      writeStdout(chunk) {
        stdout.push(chunk);
      },
      writeStderr(chunk) {
        stderr.push(chunk);
      }
    });

    renderer.push("stderr", "mcp startup: no servers\n");
    renderer.push(
      "stderr",
      "2026-02-16T08:39:03.700176Z ERROR codex_core::rollout::list: state db missing rollout path for thread 123\n"
    );
    renderer.push("stdout", "diff --git a/a.ts b/a.ts\n");
    renderer.push("stdout", "+++ b/a.ts\n--- a/a.ts\n@@ -1 +1 @@\n-old\n+new\n");
    renderer.push("stdout", "Read file \"src/TestFile.tsx\"\n");
    renderer.push("stdout", "PRIMER_REFACTOR_STATUS: COMPLETE");
    renderer.flush();

    expect(stderr).toEqual([]);
    expect(stdout).toEqual([
      "~ Updated file \"a.ts\"\n",
      "◉ Read file \"src/TestFile.tsx\"\n",
      "PRIMER_REFACTOR_STATUS: COMPLETE\n"
    ]);
  });

  it("suppresses prompt-echo instruction blocks", () => {
    const stdout: string[] = [];
    const renderer = createLiveAiOutputRenderer({
      colorize: false,
      writeStdout(chunk) {
        stdout.push(chunk);
      },
      writeStderr() {}
    });

    renderer.push("stdout", "Mode: EXECUTE\n");
    renderer.push("stdout", "- Apply the refactor changes directly in this repository now.\n");
    renderer.push("stdout", "- Keep changes focused and behavior-preserving.\n");
    renderer.push("stdout", "Final line required: PRIMER_REFACTOR_STATUS: COMPLETE\n");
    renderer.push("stdout", "diff --git a/a.ts b/a.ts\n");
    renderer.push("stdout", "@@ -1 +1 @@\n-old\n+new\n");
    renderer.flush();

    expect(stdout).toEqual([
      "╭─ AI Instructions (collapsed)\n",
      "│ Mode: EXECUTE (+3 lines)\n",
      "╰─ hidden to keep file-op logs clean\n",
      '~ Updated file "a.ts"\n'
    ]);
  });

  it("collapses execution workflow text and keeps step status visible", () => {
    const stdout: string[] = [];
    const renderer = createLiveAiOutputRenderer({
      colorize: false,
      writeStdout(chunk) {
        stdout.push(chunk);
      },
      writeStderr() {}
    });

    renderer.push("stdout", "Execution workflow:\n");
    renderer.push("stdout", "1) Establish baseline by running available verification commands before edits.\n");
    renderer.push("stdout", "2) Start with top coupling hotspots and monolith files; make focused extractions.\n");
    renderer.push("stdout", "◓  Step 3/4: Pass 6/8 - Waiting for AI response...\n");
    renderer.flush();

    expect(stdout).toEqual([
      "╭─ AI Instructions (collapsed)\n",
      "│ Execution workflow: (+2 lines)\n",
      "╰─ hidden to keep file-op logs clean\n",
      "◓  Step 3/4: Pass 6/8 - Waiting for AI response...\n"
    ]);
  });

  it("collapses prompt user-body lines and marks additional user notes in the gray frame", () => {
    const stdout: string[] = [];
    const renderer = createLiveAiOutputRenderer({
      colorize: false,
      writeStdout(chunk) {
        stdout.push(chunk);
      },
      writeStderr() {}
    });

    renderer.push("stdout", "user    You are a senior refactoring agent working directly inside this repository.\n");
    renderer.push("stdout", "Primary objective:\n");
    renderer.push("stdout", "Additional user notes:\n");
    renderer.push("stdout", "Keep UI and logic stable while reducing duplication.\n");
    renderer.push("stdout", "◓  Step 3/4: Pass 12/12 - Waiting for AI response...\n");
    renderer.flush();

    expect(stdout).toEqual([
      "╭─ AI Instructions (collapsed)\n",
      "│ Prompt body from AI handoff (+3 lines)\n",
      "│ includes Additional user notes\n",
      "╰─ hidden to keep file-op logs clean\n",
      "◓  Step 3/4: Pass 12/12 - Waiting for AI response...\n"
    ]);
  });

  it("collapses codex session metadata + prompt body into one gray frame", () => {
    const stdout: string[] = [];
    const renderer = createLiveAiOutputRenderer({
      colorize: false,
      writeStdout(chunk) {
        stdout.push(chunk);
      },
      writeStderr() {}
    });

    renderer.push("stdout", "--------\n");
    renderer.push("stdout", "workdir: /repo\n");
    renderer.push("stdout", "model: gpt-5.3-codex\n");
    renderer.push("stdout", "provider: openai\n");
    renderer.push("stdout", "session id: abc123\n");
    renderer.push("stdout", "--------\n");
    renderer.push("stdout", "user\n");
    renderer.push("stdout", "Analyze the mission and produce only JSON matching this exact shape:\n");
    renderer.push("stdout", "Additional user notes:\n");
    renderer.push("stdout", "keep behavior stable\n");
    renderer.push("stdout", "◓  Step 3/4: Pass 12/12 - Waiting for AI response...\n");
    renderer.flush();

    expect(stdout).toEqual([
      "╭─ AI Instructions (collapsed)\n",
      "│ AI session metadata & prompt (+8 lines)\n",
      "│ includes Additional user notes\n",
      "╰─ hidden to keep file-op logs clean\n",
      "◓  Step 3/4: Pass 12/12 - Waiting for AI response...\n"
    ]);
  });

  it("recognizes added/modified/removed file events from summary lines", () => {
    const stdout: string[] = [];
    const renderer = createLiveAiOutputRenderer({
      colorize: false,
      writeStdout(chunk) {
        stdout.push(chunk);
      },
      writeStderr() {}
    });

    renderer.push("stdout", "Added file src/new.ts\n");
    renderer.push("stdout", "Modified file src/existing.ts\n");
    renderer.push("stdout", "Removed file src/old.ts\n");
    renderer.flush();

    expect(stdout).toEqual([
      '+ Created file "src/new.ts"\n',
      '~ Updated file "src/existing.ts"\n',
      '- Deleted file "src/old.ts"\n'
    ]);
  });

  it("suppresses shell exec traces and emits compact read/update events only", () => {
    const stdout: string[] = [];
    const renderer = createLiveAiOutputRenderer({
      colorize: false,
      writeStdout(chunk) {
        stdout.push(chunk);
      },
      writeStderr() {}
    });

    renderer.push(
      "stdout",
      "Step 3/4: Pass 17/17 - Planning refactor steps.../bin/zsh -lc \"nl -ba src/features/Liquidity/model/hooks/useQueryTokens.ts | sed -n '1,34p'\" in /repo succeeded in 51ms:\n"
    );
    renderer.push("stdout", "     1  'use client';\n");
    renderer.push("stdout", "     2  import { useMemo } from 'react';\n");
    renderer.push("stdout", "file update:\n");
    renderer.push("stdout", "Updated file \"docs/migration/existing-context-import.md\"\n");
    renderer.push("stdout", "**Preparing concise status report**\n");
    renderer.push("stdout", "**Changed Files**\n");
    renderer.push("stdout", "- src/shared/backend-api/endpoints/health.ts:3\n");
    renderer.push("stdout", "Step 3/4: Pass 17/17 - Planning refactor steps...\n");
    renderer.flush();

    expect(stdout).toEqual([
      '◉ Read file "src/features/Liquidity/model/hooks/useQueryTokens.ts"\n',
      '~ Updated file "docs/migration/existing-context-import.md"\n',
      "Step 3/4: Pass 17/17 - Planning refactor steps...\n"
    ]);
  });

  it("shows compact tracked command execution for npm/pnpm/yarn style commands", () => {
    const stdout: string[] = [];
    const renderer = createLiveAiOutputRenderer({
      colorize: false,
      writeStdout(chunk) {
        stdout.push(chunk);
      },
      writeStderr() {}
    });

    renderer.push(
      "stdout",
      'Step 3/4: Pass 5/9 - Editing project files...exec /bin/zsh -lc "npm run build" in /repo succeeded in 4021ms:\n'
    );
    renderer.push("stdout", "Build output line 1\n");
    renderer.push("stdout", "Build output line 2\n");
    renderer.push("stdout", "Step 3/4: Pass 5/9 - Running verification checks...\n");
    renderer.flush();

    expect(stdout).toEqual([
      '▶ Running command "npm run build"\n',
      "Step 3/4: Pass 5/9 - Running verification checks...\n"
    ]);
  });

  it("hides tokens-used and raw planner JSON while showing compact plan summary", () => {
    const stdout: string[] = [];
    const renderer = createLiveAiOutputRenderer({
      colorize: false,
      writeStdout(chunk) {
        stdout.push(chunk);
      },
      writeStderr() {}
    });

    renderer.push("stdout", "tokens used\n");
    renderer.push("stdout", "101,656\n");
    renderer.push(
      "stdout",
      [
        "{",
        '  "refactorNeeded": true,',
        '  "summary": "Actionable behavior-preserving refactor work is needed",',
        '  "tasks": [',
        '    { "id": "R00", "title": "Baseline", "files": ["package.json"], "instructions": "..." },',
        '    { "id": "R01", "title": "Fix", "files": ["src/a.ts"], "instructions": "..." }',
        "  ]",
        "}"
      ].join("\n") + "\n"
    );
    renderer.push("stdout", "Step 3/4: Pass 18/21 - Running verification checks...\n");
    renderer.flush();

    expect(stdout).toEqual([
      "▣ Orchestration plan received (2 tasks)\n",
      "Step 3/4: Pass 18/21 - Running verification checks...\n"
    ]);
  });

  it("suppresses loose patch hunks and keeps only compact file events", () => {
    const stdout: string[] = [];
    const renderer = createLiveAiOutputRenderer({
      colorize: false,
      writeStdout(chunk) {
        stdout.push(chunk);
      },
      writeStderr() {}
    });

    renderer.push("stdout", "- if (currAKey !== nextAKey) {\n");
    renderer.push("stdout", "+ if (shouldSyncTokenFromProps(tokenA, tokenAProp)) {\n");
    renderer.push("stdout", "  setTokenA(tokenAProp ?? null);\n");
    renderer.push("stdout", "}\n");
    renderer.push("stdout", "Updated file \"src/features/Swap/ui/parts/DexCardDetails.tsx\"\n");
    renderer.push("stdout", " className?: string;\n");
    renderer.push("stdout", "+type DexCardDetailsRowProps = {\n");
    renderer.push("stdout", "+  left: ReactNode;\n");
    renderer.push("stdout", "+};\n");
    renderer.push("stdout", "Updated file \"src/features/Swap/ui/parts/TokenCard.tsx\"\n");
    renderer.push("stdout", "Step 3/4: Pass 17/17 - Editing project files...\n");
    renderer.flush();

    expect(stdout).toEqual([
      '~ Updated file "src/features/Swap/ui/parts/DexCardDetails.tsx"\n',
      '~ Updated file "src/features/Swap/ui/parts/TokenCard.tsx"\n',
      "Step 3/4: Pass 17/17 - Editing project files...\n"
    ]);
  });
});
