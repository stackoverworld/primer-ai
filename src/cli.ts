import { homedir } from "node:os";
import { resolve } from "node:path";

import { log } from "@clack/prompts";
import { Command } from "commander";

import { runInit } from "./commands/init.js";
import { runRefactor } from "./commands/refactor.js";
import type { InitCommandOptions, RefactorCommandOptions } from "./core/types.js";
import packageJson from "../package.json" with { type: "json" };

const program = new Command();
const CLI_VERSION = packageJson.version;
const RELEASE_CHANNEL = "beta";
const AUTHOR_HANDLE = "@stackoverworld";
const AUTHOR_URL = "https://github.com/stackoverworld";
const CAT_ART = [" /\\_/\\ ", "( o.o )"];

const ANSI = {
  reset: "\u001B[0m",
  bold: "\u001B[1m",
  borderGray: "\u001B[38;5;245m",
  mutedGray: "\u001B[38;5;250m",
  white: "\u001B[97m",
  orange: "\u001B[38;5;208m"
} as const;

const COLOR_ENABLED = Boolean(process.stdout.isTTY) && process.env.NO_COLOR === undefined && process.env.TERM !== "dumb";

function paint(text: string, ...codes: string[]): string {
  if (!COLOR_ENABLED || text.length === 0) return text;
  return `${codes.join("")}${text}${ANSI.reset}`;
}

function supportsHyperlinks(): boolean {
  if (!process.stdout.isTTY) return false;
  if (process.env.FORCE_HYPERLINK === "0") return false;
  if (process.env.FORCE_HYPERLINK === "1") return true;
  if (process.env.WT_SESSION) return true;
  if (process.env.KITTY_WINDOW_ID) return true;
  const termProgram = process.env.TERM_PROGRAM ?? "";
  if (termProgram === "iTerm.app" || termProgram === "vscode" || termProgram === "WezTerm") return true;
  const term = process.env.TERM ?? "";
  return term.includes("xterm") || term.includes("tmux") || term.includes("screen");
}

function hyperlink(label: string, url: string): string {
  if (!supportsHyperlinks()) return label;
  return `\u001B]8;;${url}\u0007${label}\u001B]8;;\u0007`;
}

function compactPath(path: string): string {
  const home = homedir();
  return path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}

function ellipsize(text: string, maxWidth: number): string {
  if (maxWidth <= 0) return "";
  if (text.length <= maxWidth) return text;
  if (maxWidth <= 1) return "…";
  const head = Math.max(1, Math.floor((maxWidth - 1) * 0.7));
  const tail = Math.max(0, maxWidth - 1 - head);
  return `${text.slice(0, head)}…${text.slice(text.length - tail)}`;
}

function renderInfoLeft(label: string, value: string, width: number): { plain: string; styled: string } {
  const labelBlock = `${label}:`.padEnd(11, " ");
  const valueWidth = Math.max(0, width - labelBlock.length);
  const valueFitted = ellipsize(value, valueWidth);
  const plain = `${labelBlock}${valueFitted}`;
  const styled = `${paint(labelBlock, ANSI.mutedGray)}${paint(valueFitted, ANSI.white)}`;
  return { plain, styled };
}

function renderBrandHeader(pathArg: string | undefined): void {
  const directory = compactPath(process.cwd());
  const target = compactPath(resolve(process.cwd(), pathArg ?? "."));
  const terminalWidth = process.stdout.columns ?? 80;
  const maxInnerWidth = Math.max(36, terminalWidth - 4);
  const defaultInnerWidth = Math.min(78, maxInnerWidth);

  let rightWidth = Math.max(...CAT_ART.map((line) => line.length));
  let gapWidth = 3;
  let leftWidth = defaultInnerWidth - rightWidth - gapWidth;
  if (leftWidth < 28) {
    rightWidth = 0;
    gapWidth = 0;
    leftWidth = defaultInnerWidth;
  }

  const rows = [
    {
      left: "primer-ai",
      renderLeft: (text: string) => paint(text, ANSI.bold, ANSI.orange),
      right: CAT_ART[0] ?? "",
      renderRight: (text: string) => paint(text, ANSI.bold, ANSI.orange)
    },
    {
      left: "AI scaffold context generator",
      renderLeft: (text: string) => paint(text, ANSI.white),
      right: CAT_ART[1] ?? "",
      renderRight: (text: string) => paint(text, ANSI.orange)
    },
    {
      left: `by ${AUTHOR_HANDLE}`,
      renderLeft: (text: string) => {
        const prefix = "by ";
        if (!text.startsWith(prefix)) return paint(text, ANSI.mutedGray);
        const handle = text.slice(prefix.length);
        const linkedHandle = handle === AUTHOR_HANDLE ? hyperlink(handle, AUTHOR_URL) : handle;
        return `${paint(prefix, ANSI.mutedGray)}${paint(linkedHandle, ANSI.bold, ANSI.orange)}`;
      },
      right: "",
      renderRight: (text: string) => paint(text, ANSI.orange)
    },
    {
      left: "",
      renderLeft: (text: string) => text,
      right: "",
      renderRight: (text: string) => text
    }
  ];

  const versionLeft = renderInfoLeft("version", `v${CLI_VERSION} (${RELEASE_CHANNEL})`, leftWidth);
  const directoryLeft = renderInfoLeft("directory", directory, leftWidth);
  const targetLeft = renderInfoLeft("target", target, leftWidth);

  const border = paint(`╭${"─".repeat(defaultInnerWidth + 2)}╮`, ANSI.borderGray);
  const bottomBorder = paint(`╰${"─".repeat(defaultInnerWidth + 2)}╯`, ANSI.borderGray);
  const vertical = paint("│", ANSI.borderGray);

  console.log(border);
  for (const row of rows) {
    const leftFitted = ellipsize(row.left, leftWidth);
    const leftPadding = " ".repeat(Math.max(0, leftWidth - leftFitted.length));
    const leftRendered = `${row.renderLeft(leftFitted)}${leftPadding}`;
    if (rightWidth > 0) {
      const rightFitted = ellipsize(row.right, rightWidth);
      const rightPadding = " ".repeat(Math.max(0, rightWidth - rightFitted.length));
      const rightRendered = `${row.renderRight(rightFitted)}${rightPadding}`;
      console.log(`${vertical} ${leftRendered}${" ".repeat(gapWidth)}${rightRendered} ${vertical}`);
    } else {
      console.log(`${vertical} ${leftRendered} ${vertical}`);
    }
  }

  const metaRows = [versionLeft, directoryLeft, targetLeft];
  for (const row of metaRows) {
    const leftPadding = " ".repeat(Math.max(0, leftWidth - row.plain.length));
    const leftRendered = `${row.styled}${leftPadding}`;
    if (rightWidth > 0) {
      console.log(`${vertical} ${leftRendered}${" ".repeat(gapWidth + rightWidth)} ${vertical}`);
    } else {
      console.log(`${vertical} ${leftRendered} ${vertical}`);
    }
  }
  console.log(bottomBorder);
  console.log("");
}

program
  .name("primer-ai")
  .description("Scaffold AI-optimized project architecture for Codex CLI (recommended), optional Claude Code, and Cursor.")
  .version(CLI_VERSION);

program
  .command("init")
  .description("Initialize the current or target folder with primer-ai architecture scaffold.")
  .argument("[path]", "Target directory (defaults to current working directory)")
  .option("--description <text>", "Project description")
  .option("--stack <text>", "Tech stack summary")
  .option("--project-type <type>", "web-app | api-service | library | cli-tool | monorepo | custom")
  .option("--agent <target>", "codex | claude | both")
  .option("--mode <mode>", "template | ai-assisted")
  .option("--provider <provider>", "auto | codex | claude")
  .option("--model <model>", "Model id to use when provider is codex or claude")
  .option("--cursor", "Generate .cursor/rules files", false)
  .option("--no-cursor", "Skip .cursor/rules generation")
  .option("--git-init", "Run git init if missing", true)
  .option("--no-git-init", "Skip git initialization")
  .option("--quick-setup", "Run AI quick setup for supported stacks (AI-assisted mode only)", false)
  .option("-y, --yes", "Use defaults and skip interactive prompts")
  .option("--force", "Allow scaffolding into a non-empty folder")
  .action(async (pathArg: string | undefined, rawOptions: InitCommandOptions) => {
    renderBrandHeader(pathArg);
    await runInit(pathArg, rawOptions);
  });

program
  .command("refactor")
  .description("Scan the repository and run a Codex-first AI-guided refactor for scalability and maintainability.")
  .argument("[path]", "Target directory (defaults to current working directory)")
  .option("--provider <provider>", "auto | codex | claude")
  .option("--model <model>", "Model id to use when provider is codex or claude")
  .option("--planner-model <model>", "Planner model id for Codex orchestration mode")
  .option("--orchestrator-model <model>", "Orchestrator model id for Codex orchestration mode")
  .option("--worker-model <model>", "Worker model id for Codex orchestration mode")
  .option("--agent <target>", "codex | claude | both")
  .option("--notes <text>", "Custom notes for AI scan calibration and refactor execution")
  .option("--focus <text>", "Extra refactor objective to prioritize")
  .option("--show-ai-file-ops", "Show AI file edit/create operations in console output", false)
  .option("--orchestration", "Use Codex orchestration mode for coordinated subagent execution", true)
  .option("--no-orchestration", "Disable Codex orchestration mode")
  .option("--max-subagents <count>", "Maximum Codex subagents when orchestration is enabled (1-24)")
  .option("--max-files <count>", "Maximum number of source files to scan (optional; defaults auto)")
  .option("--max-passes <count>", "Maximum AI refactor passes before stopping (optional; defaults auto)")
  .option("--ai-timeout-sec <seconds>", "Timeout per AI subprocess in seconds (default: 1800)")
  .option("--resume", "Resume interrupted refactor from saved checkpoint when available", true)
  .option("--no-resume", "Start refactor from scratch and ignore saved checkpoint")
  .option("--dry-run", "Generate refactor instructions only; do not execute AI refactor", false)
  .option("-y, --yes", "Skip interactive confirmation prompts")
  .action(async (pathArg: string | undefined, rawOptions: RefactorCommandOptions) => {
    renderBrandHeader(pathArg);
    await runRefactor(pathArg, rawOptions);
  });

async function main(): Promise<void> {
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(message);
    process.exitCode = 1;
  }
}

void main();
