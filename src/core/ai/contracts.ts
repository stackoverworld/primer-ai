export interface CommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  reason?: string;
}

export type StatusCallback = (message: string) => void;
