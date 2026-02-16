import { spawn } from "node:child_process";

import type { CommandResult } from "./contracts.js";

interface RunCommandOptions {
  cwd?: string | undefined;
  inheritOutput?: boolean | undefined;
  maxBufferBytes?: number | undefined;
  timeoutMs?: number | undefined;
}

const DEFAULT_MAX_BUFFER_BYTES = 10 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 8 * 60 * 1000;

export function runCommand(command: string, args: string[], options: RunCommandOptions = {}): Promise<CommandResult> {
  const maxBufferBytes = options.maxBufferBytes ?? DEFAULT_MAX_BUFFER_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const inheritOutput = options.inheritOutput ?? false;

  return new Promise((resolveResult) => {
    let stdout = "";
    let stderr = "";
    let done = false;
    let timedOut = false;
    let exceededBuffer = false;

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

    const addChunk = (current: string, chunk: string): string => {
      const next = current + chunk;
      if (Buffer.byteLength(next, "utf8") > maxBufferBytes) {
        exceededBuffer = true;
        child.kill("SIGKILL");
      }
      return next;
    };

    if (child.stdout) {
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        if (inheritOutput) {
          process.stdout.write(chunk);
        }
        stdout = addChunk(stdout, chunk);
      });
    }

    if (child.stderr) {
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        if (inheritOutput) {
          process.stderr.write(chunk);
        }
        stderr = addChunk(stderr, chunk);
      });
    }

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
          reason: `timeout after ${timeoutMs / 1000}s`
        });
        return;
      }

      if (exceededBuffer) {
        resolveOnce({
          ok: false,
          stdout,
          stderr,
          reason: `output exceeded ${maxBufferBytes} bytes`
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
