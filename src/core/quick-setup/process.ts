import { spawn } from "node:child_process";

export interface CommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  reason?: string;
}

export function runCommand(command: string, args: string[], cwd: string): Promise<CommandResult> {
  const timeoutMs = 8 * 60 * 1000;
  const maxBufferBytes = 8 * 1024 * 1024;

  const trimToTailWithinBytes = (value: string): string => {
    if (Buffer.byteLength(value, "utf8") <= maxBufferBytes) return value;
    let low = 0;
    let high = value.length;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      const sliced = value.slice(mid);
      if (Buffer.byteLength(sliced, "utf8") > maxBufferBytes) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    return value.slice(low);
  };

  return new Promise((resolveResult) => {
    let stdout = "";
    let stderr = "";
    let completed = false;
    let timedOut = false;
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    const resolveOnce = (result: CommandResult): void => {
      if (completed) return;
      completed = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      resolveResult(result);
    };

    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"]
    });

    const appendChunk = (
      buffer: string,
      chunk: string
    ): {
      next: string;
      truncated: boolean;
    } => {
      const rawNext = buffer + chunk;
      return {
        next: trimToTailWithinBytes(rawNext),
        truncated: Buffer.byteLength(rawNext, "utf8") > maxBufferBytes
      };
    };

    const withOutputTailNotice = (reason: string): string => {
      if (!stdoutTruncated && !stderrTruncated) return reason;
      return `${reason}; output truncated to last ${maxBufferBytes} bytes per stream`;
    };

    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      const appended = appendChunk(stdout, chunk);
      stdout = appended.next;
      stdoutTruncated = stdoutTruncated || appended.truncated;
    });

    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      const appended = appendChunk(stderr, chunk);
      stderr = appended.next;
      stderrTruncated = stderrTruncated || appended.truncated;
    });

    child.on("error", (error) => {
      resolveOnce({
        ok: false,
        stdout,
        stderr,
        reason: withOutputTailNotice(error.message)
      });
    });

    child.on("close", (code) => {
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

    timeoutHandle = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
  });
}
