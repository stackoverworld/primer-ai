import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { RefactorPolicy } from "../../core/refactor-policy.js";
import type { RepoRefactorScan } from "../../core/refactor.js";

type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

export interface FixVerificationPlan {
  packageManager: PackageManager;
  scripts: Set<string>;
  commands: string[];
}

export interface FixVerificationCommandResult {
  command: string;
  ok: boolean;
  skipped: boolean;
  actionableFailure: boolean;
  reason?: string;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface FixVerificationCycleResult {
  results: FixVerificationCommandResult[];
  actionableFailures: FixVerificationCommandResult[];
}

interface RunShellCommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  reason?: string;
}

interface ShellInvocation {
  executable: string;
  args: string[];
}

interface PackageManifestData {
  scripts: Set<string>;
  dependencies: Set<string>;
}

const SCRIPT_CANDIDATES = ["lint", "typecheck", "test", "build", "check", "verify"] as const;
const DEFAULT_VERIFICATION_TIMEOUT_MS = 6 * 60 * 1000;
const MAX_BUFFER_BYTES = 12 * 1024 * 1024;
const TOOL_PACKAGE_BY_BINARY: Record<string, string[]> = {
  eslint: ["eslint"],
  jest: ["jest"],
  next: ["next"],
  tsc: ["typescript"],
  vite: ["vite"],
  vitest: ["vitest"]
};
const LOCK_CONTENTION_MARKERS = [
  ".next/lock",
  "another process is running",
  "could not acquire lock",
  "timed out waiting for lock",
  "resource busy or locked",
  "resource busy"
] as const;

function uniqueCommands(commands: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const command of commands) {
    const normalized = command.trim();
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(normalized);
  }
  return unique;
}

function detectPackageManager(root: string): PackageManager {
  if (existsSync(join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(root, "yarn.lock"))) return "yarn";
  if (existsSync(join(root, "bun.lockb")) || existsSync(join(root, "bun.lock"))) return "bun";
  return "npm";
}

function addDependencyNames(value: unknown, output: Set<string>): void {
  if (!value || typeof value !== "object") return;
  for (const entry of Object.keys(value as Record<string, unknown>)) {
    output.add(entry.toLowerCase());
  }
}

function readPackageManifest(root: string): PackageManifestData {
  const packageJsonPath = join(root, "package.json");
  if (!existsSync(packageJsonPath)) {
    return {
      scripts: new Set<string>(),
      dependencies: new Set<string>()
    };
  }

  try {
    const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      scripts?: Record<string, unknown>;
      dependencies?: Record<string, unknown>;
      devDependencies?: Record<string, unknown>;
      optionalDependencies?: Record<string, unknown>;
      peerDependencies?: Record<string, unknown>;
    };

    const scripts = new Set<string>();
    if (parsed.scripts && typeof parsed.scripts === "object") {
      for (const name of Object.keys(parsed.scripts)) {
        scripts.add(name.toLowerCase());
      }
    }

    const dependencies = new Set<string>();
    addDependencyNames(parsed.dependencies, dependencies);
    addDependencyNames(parsed.devDependencies, dependencies);
    addDependencyNames(parsed.optionalDependencies, dependencies);
    addDependencyNames(parsed.peerDependencies, dependencies);

    return { scripts, dependencies };
  } catch {
    return {
      scripts: new Set<string>(),
      dependencies: new Set<string>()
    };
  }
}

function scriptCommand(packageManager: PackageManager, scriptName: string): string {
  return `${packageManager} run ${scriptName}`;
}

function execPrefix(packageManager: PackageManager): string {
  if (packageManager === "pnpm") return "pnpm exec";
  if (packageManager === "bun") return "bun x";
  if (packageManager === "yarn") return "yarn";
  return "npx --no-install";
}

function execCommand(packageManager: PackageManager, executableAndArgs: string): string {
  return `${execPrefix(packageManager)} ${executableAndArgs}`.trim();
}

function shouldWrapBareToolCommand(command: string, dependencies: Set<string>): boolean {
  const match = command.trim().match(/^([A-Za-z0-9:_-]+)/);
  if (!match?.[1]) return false;
  const binary = match[1].toLowerCase();
  const toolPackages = TOOL_PACKAGE_BY_BINARY[binary];
  if (!toolPackages) return false;
  return toolPackages.some((pkg) => dependencies.has(pkg));
}

function mapPolicyCommandForPackageManager(
  command: string,
  packageManager: PackageManager,
  dependencies: Set<string>
): string {
  const normalized = command.trim();
  if (!normalized) return normalized;

  const scriptMatch = command.match(/^npm\s+run\s+([A-Za-z0-9:_-]+)$/i);
  if (scriptMatch?.[1]) {
    return scriptCommand(packageManager, scriptMatch[1]);
  }

  const npxMatch = normalized.match(/^npx(?:\s+--no-install)?\s+(.+)$/i);
  if (npxMatch?.[1]) {
    return execCommand(packageManager, npxMatch[1]);
  }

  if (shouldWrapBareToolCommand(normalized, dependencies)) {
    return execCommand(packageManager, normalized);
  }

  return normalized;
}

function parseScriptInvocation(command: string): { packageManager: PackageManager; scriptName: string } | null {
  const match = command.match(/^(npm|pnpm|yarn|bun)\s+run\s+([A-Za-z0-9:_-]+)$/i);
  if (!match?.[1] || !match[2]) return null;
  return {
    packageManager: match[1].toLowerCase() as PackageManager,
    scriptName: match[2].toLowerCase()
  };
}

function summarizeFailureResult(result: RunShellCommandResult): string {
  const reason = result.reason ?? "unknown failure";
  const combined = `${result.stderr}\n${result.stdout}`.replace(/\s+/g, " ").trim();
  if (!combined) return reason;
  const snippet = combined.length > 200 ? `${combined.slice(0, 200)}...` : combined;
  return `${reason}: ${snippet}`;
}

function isSpawnEnoentFailure(result: RunShellCommandResult): boolean {
  const reason = result.reason?.toLowerCase() ?? "";
  return reason.includes("spawn") && reason.includes("enoent");
}

function hasShellCommandMissingSignal(output: string): boolean {
  return (
    /(?:^|\r?\n)(?:zsh|bash|sh):\s*(?:[0-9]+:\s*)?.*command not found/i.test(output) ||
    /(?:^|\r?\n)(?:zsh|bash|sh):\s*(?:[0-9]+:\s*)?.*no such file or directory/i.test(output) ||
    /(?:^|\r?\n).+ is not recognized as an internal or external command/i.test(output)
  );
}

function isNonActionableFailure(result: RunShellCommandResult): boolean {
  const reason = result.reason?.toLowerCase() ?? "";
  const output = `${result.stderr}\n${result.stdout}`;
  const normalizedOutput = output.toLowerCase();
  if (reason.startsWith("timeout after")) {
    return true;
  }
  if (isSpawnEnoentFailure(result)) {
    return true;
  }
  if (LOCK_CONTENTION_MARKERS.some((marker) => normalizedOutput.includes(marker))) {
    return true;
  }
  if (hasShellCommandMissingSignal(output)) {
    return true;
  }
  return (
    normalizedOutput.includes("missing script:") ||
    normalizedOutput.includes("missing tasks in project") ||
    normalizedOutput.includes("there are no scripts specified") ||
    normalizedOutput.includes("could not determine executable to run")
  );
}

function hasDependency(dependencies: Set<string>, packageName: string): boolean {
  return dependencies.has(packageName.toLowerCase());
}

function buildToolBackfillCommands(
  packageManager: PackageManager,
  scripts: Set<string>,
  dependencies: Set<string>,
  targetDir: string
): string[] {
  const commands: string[] = [];
  const hasTsConfig = existsSync(join(targetDir, "tsconfig.json"));

  if (!scripts.has("lint") && hasDependency(dependencies, "eslint")) {
    commands.push(execCommand(packageManager, "eslint ."));
  }

  if (!scripts.has("typecheck") && hasDependency(dependencies, "typescript") && hasTsConfig) {
    commands.push(execCommand(packageManager, "tsc --noEmit"));
  }

  if (!scripts.has("test")) {
    if (hasDependency(dependencies, "vitest")) {
      commands.push(execCommand(packageManager, "vitest run"));
    } else if (hasDependency(dependencies, "jest")) {
      commands.push(execCommand(packageManager, "jest --runInBand"));
    }
  }

  if (!scripts.has("build")) {
    if (hasDependency(dependencies, "next")) {
      commands.push(execCommand(packageManager, "next build"));
    } else if (hasDependency(dependencies, "vite")) {
      commands.push(execCommand(packageManager, "vite build"));
    }
  }

  return commands;
}

async function runShellCommand(command: string, cwd: string, timeoutMs: number): Promise<RunShellCommandResult> {
  return new Promise((resolveResult) => {
    let stdout = "";
    let stderr = "";
    let resolved = false;
    let timedOut = false;
    let exceededBuffer = false;

    const resolveOnce = (result: RunShellCommandResult): void => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeoutHandle);
      resolveResult(result);
    };

    const shell = resolveShellInvocation(command);
    const child = spawn(shell.executable, shell.args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"]
    });

    const appendChunk = (buffer: string, chunk: string): string => {
      const next = buffer + chunk;
      if (Buffer.byteLength(next, "utf8") > MAX_BUFFER_BYTES) {
        exceededBuffer = true;
        child.kill("SIGKILL");
      }
      return next;
    };

    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout = appendChunk(stdout, chunk);
    });

    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderr = appendChunk(stderr, chunk);
    });

    child.on("error", (error) => {
      resolveOnce({
        ok: false,
        stdout,
        stderr,
        reason: error.message
      });
    });

    child.on("close", (code) => {
      if (timedOut) {
        resolveOnce({
          ok: false,
          stdout,
          stderr,
          reason: `timeout after ${Math.floor(timeoutMs / 1000)}s`
        });
        return;
      }
      if (exceededBuffer) {
        resolveOnce({
          ok: false,
          stdout,
          stderr,
          reason: `output exceeded ${MAX_BUFFER_BYTES} bytes`
        });
        return;
      }
      if (code !== 0) {
        resolveOnce({
          ok: false,
          stdout,
          stderr,
          reason: `exit code ${code ?? "unknown"}`
        });
        return;
      }
      resolveOnce({
        ok: true,
        stdout,
        stderr
      });
    });

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
  });
}

function resolveShellInvocation(command: string): ShellInvocation {
  if (process.platform === "win32") {
    return {
      executable: process.env["COMSPEC"] ?? "cmd.exe",
      args: ["/d", "/s", "/c", command]
    };
  }
  return {
    executable: process.env.SHELL?.trim() || "sh",
    args: ["-lc", command]
  };
}

export function buildFixVerificationPlan(scan: RepoRefactorScan, policy: RefactorPolicy): FixVerificationPlan {
  const packageManager = detectPackageManager(scan.targetDir);
  const manifest = readPackageManifest(scan.targetDir);
  const scripts = manifest.scripts;
  const dependencies = manifest.dependencies;

  const policyCommands = policy.verificationCommands.map((command) =>
    mapPolicyCommandForPackageManager(command, packageManager, dependencies)
  );
  const scriptBackfill = SCRIPT_CANDIDATES.filter((script) => scripts.has(script)).map((script) =>
    scriptCommand(packageManager, script)
  );
  const toolBackfill = buildToolBackfillCommands(packageManager, scripts, dependencies, scan.targetDir);

  return {
    packageManager,
    scripts,
    commands: uniqueCommands([...policyCommands, ...scriptBackfill, ...toolBackfill])
  };
}

export async function runFixVerificationCycle(
  plan: FixVerificationPlan,
  options: { cwd: string; timeoutMs?: number; onStatus?: (message: string) => void }
): Promise<FixVerificationCycleResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_VERIFICATION_TIMEOUT_MS;
  const results: FixVerificationCommandResult[] = [];

  for (let index = 0; index < plan.commands.length; index += 1) {
    const command = plan.commands[index] ?? "";
    options.onStatus?.(`Verification ${index + 1}/${plan.commands.length}: ${command}`);

    const scriptInvocation = parseScriptInvocation(command);
    if (scriptInvocation && !plan.scripts.has(scriptInvocation.scriptName)) {
      results.push({
        command,
        ok: false,
        skipped: true,
        actionableFailure: false,
        reason: `skipped (missing script: ${scriptInvocation.scriptName})`,
        stdout: "",
        stderr: "",
        durationMs: 0
      });
      continue;
    }

    const startedAt = Date.now();
    const result = await runShellCommand(command, options.cwd, timeoutMs);
    const durationMs = Date.now() - startedAt;

    if (result.ok) {
      results.push({
        command,
        ok: true,
        skipped: false,
        actionableFailure: false,
        stdout: result.stdout,
        stderr: result.stderr,
        durationMs
      });
      continue;
    }

    if (isNonActionableFailure(result)) {
      results.push({
        command,
        ok: false,
        skipped: true,
        actionableFailure: false,
        reason: `skipped (${summarizeFailureResult(result)})`,
        stdout: result.stdout,
        stderr: result.stderr,
        durationMs
      });
      continue;
    }

    results.push({
      command,
      ok: false,
      skipped: false,
      actionableFailure: true,
      reason: summarizeFailureResult(result),
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs
    });
  }

  return {
    results,
    actionableFailures: results.filter((result) => result.actionableFailure)
  };
}
