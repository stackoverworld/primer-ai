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

  return new Promise((resolveResult) => {
    let stdout = "";
    let stderr = "";
    let completed = false;
    let timedOut = false;
    let exceededBuffer = false;
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

    const appendChunk = (buffer: string, chunk: string): string => {
      const next = buffer + chunk;
      if (Buffer.byteLength(next, "utf8") > maxBufferBytes) {
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

    timeoutHandle = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
  });
}
