export type CliOutputFormat = "text" | "json";

const EXIT_CODE_OPERATIONAL_FAILURE = 1;
const EXIT_CODE_CONTRACT_OR_CONFIG_FAILURE = 2;

interface PrimerErrorOptions {
  cause?: unknown;
  details?: Record<string, unknown>;
}

export class PrimerError extends Error {
  readonly code: string;
  readonly exitCode: number;
  readonly details?: Record<string, unknown>;

  constructor(message: string, code: string, exitCode: number, options: PrimerErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.code = code;
    this.exitCode = exitCode;
    if (options.details !== undefined) {
      this.details = options.details;
    }
  }
}

export class UserInputError extends PrimerError {
  constructor(message: string, options: PrimerErrorOptions = {}) {
    super(message, "USER_INPUT", EXIT_CODE_CONTRACT_OR_CONFIG_FAILURE, options);
  }
}

export class ConfigError extends PrimerError {
  constructor(message: string, options: PrimerErrorOptions = {}) {
    super(message, "CONFIG", EXIT_CODE_CONTRACT_OR_CONFIG_FAILURE, options);
  }
}

export class ExecutionError extends PrimerError {
  constructor(message: string, options: PrimerErrorOptions = {}) {
    super(message, "EXECUTION", EXIT_CODE_OPERATIONAL_FAILURE, options);
  }
}

function isCommanderErrorLike(error: unknown): error is { code?: unknown; message?: unknown } {
  if (!error || typeof error !== "object") return false;
  if (!("code" in error)) return false;
  return typeof (error as { code?: unknown }).code === "string";
}

export function normalizeError(error: unknown): PrimerError {
  if (error instanceof PrimerError) return error;
  if (isCommanderErrorLike(error) && String(error.code).startsWith("commander.")) {
    const message = error instanceof Error ? error.message : String(error.message ?? error.code);
    return new UserInputError(message, {
      cause: error,
      details: {
        commanderCode: String(error.code)
      }
    });
  }
  if (error instanceof Error) {
    return new ExecutionError(error.message, { cause: error });
  }
  return new ExecutionError(String(error));
}

export function normalizeOutputFormat(value: string | undefined): CliOutputFormat {
  const normalized = value?.trim().toLowerCase() ?? "text";
  if (normalized === "text" || normalized === "json") {
    return normalized;
  }
  throw new UserInputError(`Invalid --format value "${String(value)}". Expected "text" or "json".`);
}

export function resolveOutputFormatFromArgv(argv: string[]): CliOutputFormat {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) continue;
    if (token === "--format") {
      const next = argv[index + 1];
      if (!next) return "text";
      const value = next.trim().toLowerCase();
      if (value === "json") return "json";
      if (value === "text") return "text";
      return "text";
    }
    if (!token.startsWith("--format=")) continue;
    const value = token.slice("--format=".length).trim().toLowerCase();
    if (value === "json") return "json";
    if (value === "text") return "text";
    return "text";
  }
  return "text";
}

export function toJsonErrorPayload(error: PrimerError): Record<string, unknown> {
  return {
    error: {
      code: error.code,
      type: error.name,
      message: error.message,
      exitCode: error.exitCode,
      ...(error.details ? { details: error.details } : {})
    }
  };
}
