import { spawn } from "node:child_process";

import type { CommandResult } from "./contracts.js";
import { createLiveAiOutputRenderer } from "./live-output.js";

interface RunCommandOptions {
  cwd?: string | undefined;
  inheritOutput?: boolean | undefined;
  maxBufferBytes?: number | undefined;
  timeoutMs?: number | undefined;
  stopOnOutputPattern?: RegExp | undefined;
  onActivity?: ((message: string) => void) | undefined;
}

const DEFAULT_MAX_BUFFER_BYTES = 10 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 8 * 60 * 1000;
const ACTIVITY_EMIT_THROTTLE_MS = 3_000;

function consumeCompleteLines(buffer: string, onLine: (line: string) => void): string {
  let lineStart = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    const char = buffer[index];
    if (char !== "\n" && char !== "\r") continue;
    onLine(buffer.slice(lineStart, index));
    if (char === "\r" && buffer[index + 1] === "\n") {
      index += 1;
    }
    lineStart = index + 1;
  }
  return buffer.slice(lineStart);
}

function inferActivityFromLine(rawLine: string): string | null {
  const line = rawLine.trim();
  if (!line) return null;
  const lower = line.toLowerCase();

  if (
    lower.includes("thinking") ||
    lower.includes("planning") ||
    lower.includes("finalizing task structure") ||
    lower.includes("produce only json matching this exact shape")
  ) {
    return "AI activity: planning changes";
  }

  if (
    /^read(?:ing)?\s+file\b/i.test(line) ||
    /^open(?:ed)?\s+file\b/i.test(line) ||
    /^view(?:ed)?\s+file\b/i.test(line) ||
    lower.includes("analyzing") ||
    lower.includes("analyze the mission")
  ) {
    return "AI activity: reading project files";
  }

  if (
    /^diff --git\b/i.test(line) ||
    /^@@\s/.test(line) ||
    /^added file\b/i.test(line) ||
    /^modified file\b/i.test(line) ||
    /^removed file\b/i.test(line) ||
    /^created file\b/i.test(line) ||
    /^updated file\b/i.test(line) ||
    /^deleted file\b/i.test(line) ||
    lower.includes("applying refactor updates")
  ) {
    return "AI activity: editing project files";
  }

  if (
    /(?:^|\s)(?:npm|pnpm|yarn|bun|npx)\s+(?:run\s+)?(?:lint|test|build|check|typecheck|tsc|vitest|jest|next|vite)\b/i.test(
      line
    ) ||
    lower.includes("verification complete") ||
    lower.includes("running verification")
  ) {
    return "AI activity: running verification checks";
  }

  if (/^tokens used\b/i.test(line) || /^primer_refactor_status:\s*(complete|continue)/i.test(line)) {
    return "AI activity: preparing completion report";
  }

  return null;
}

function trimToTailWithinBytes(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) return value;
  let low = 0;
  let high = value.length;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const sliced = value.slice(mid);
    if (Buffer.byteLength(sliced, "utf8") > maxBytes) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return value.slice(low);
}

export function runCommand(command: string, args: string[], options: RunCommandOptions = {}): Promise<CommandResult> {
  const maxBufferBytes = options.maxBufferBytes ?? DEFAULT_MAX_BUFFER_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const inheritOutput = options.inheritOutput ?? false;
  const stopOnOutputPattern = options.stopOnOutputPattern
    ? new RegExp(options.stopOnOutputPattern.source, options.stopOnOutputPattern.flags.replaceAll("g", ""))
    : undefined;

  return new Promise((resolveResult) => {
    let stdout = "";
    let stderr = "";
    let done = false;
    let timedOut = false;
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let completedByOutputPattern = false;
    let stopRequested = false;
    let stdoutActivityPending = "";
    let stderrActivityPending = "";
    let lastActivityMessage = "";
    let lastActivityAtMs = 0;
    const liveOutput = inheritOutput ? createLiveAiOutputRenderer() : null;

    const resolveOnce = (value: CommandResult): void => {
      if (done) return;
      done = true;
      clearTimeout(timeoutHandle);
      resolveResult(value);
    };

    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"]
    });

    const requestStopOnOutputPattern = (): void => {
      if (!stopOnOutputPattern || stopRequested) return;
      const tail = `${stdout}\n${stderr}`.slice(-4096);
      if (!stopOnOutputPattern.test(tail)) return;
      completedByOutputPattern = true;
      stopRequested = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!done) child.kill("SIGKILL");
      }, 800).unref();
    };

    const addChunk = (
      current: string,
      chunk: string
    ): {
      next: string;
      truncated: boolean;
    } => {
      const next = trimToTailWithinBytes(current + chunk, maxBufferBytes);
      const truncated = Buffer.byteLength(current + chunk, "utf8") > maxBufferBytes;
      return { next, truncated };
    };

    const withOutputTailNotice = (reason: string): string => {
      if (!stdoutTruncated && !stderrTruncated) return reason;
      return `${reason}; output truncated to last ${maxBufferBytes} bytes per stream`;
    };

    const emitActivity = (line: string): void => {
      if (!options.onActivity) return;
      const activity = inferActivityFromLine(line);
      if (!activity) return;
      const now = Date.now();
      if (activity === lastActivityMessage && now - lastActivityAtMs < ACTIVITY_EMIT_THROTTLE_MS) {
        return;
      }
      lastActivityMessage = activity;
      lastActivityAtMs = now;
      options.onActivity(activity);
    };

    const processActivityChunk = (stream: "stdout" | "stderr", chunk: string): void => {
      if (!options.onActivity) return;
      if (stream === "stdout") {
        stdoutActivityPending = consumeCompleteLines(stdoutActivityPending + chunk, emitActivity);
        return;
      }
      stderrActivityPending = consumeCompleteLines(stderrActivityPending + chunk, emitActivity);
    };

    if (child.stdout) {
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        processActivityChunk("stdout", chunk);
        liveOutput?.push("stdout", chunk);
        const appended = addChunk(stdout, chunk);
        stdout = appended.next;
        stdoutTruncated = stdoutTruncated || appended.truncated;
        requestStopOnOutputPattern();
      });
    }

    if (child.stderr) {
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        processActivityChunk("stderr", chunk);
        liveOutput?.push("stderr", chunk);
        const appended = addChunk(stderr, chunk);
        stderr = appended.next;
        stderrTruncated = stderrTruncated || appended.truncated;
        requestStopOnOutputPattern();
      });
    }

    child.on("error", (error) => {
      liveOutput?.flush();
      if (completedByOutputPattern) {
        resolveOnce({
          ok: true,
          stdout,
          stderr
        });
        return;
      }
      resolveOnce({
        ok: false,
        stdout,
        stderr,
        reason: withOutputTailNotice(error.message)
      });
    });

    child.on("close", (code) => {
      if (stdoutActivityPending.length > 0) {
        emitActivity(stdoutActivityPending);
        stdoutActivityPending = "";
      }
      if (stderrActivityPending.length > 0) {
        emitActivity(stderrActivityPending);
        stderrActivityPending = "";
      }
      liveOutput?.flush();
      if (completedByOutputPattern) {
        resolveOnce({
          ok: true,
          stdout,
          stderr
        });
        return;
      }

      if (timedOut) {
        resolveOnce({
          ok: false,
          stdout,
          stderr,
          reason: withOutputTailNotice(`timeout after ${timeoutMs / 1000}s`)
        });
        return;
      }

      if (code !== 0) {
        resolveOnce({
          ok: false,
          stdout,
          stderr,
          reason: withOutputTailNotice(`exit code ${code ?? "unknown"}`)
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
