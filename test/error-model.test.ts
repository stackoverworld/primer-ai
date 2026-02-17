import { describe, expect, it } from "vitest";

import {
  ExecutionError,
  UserInputError,
  normalizeError,
  normalizeOutputFormat,
  toJsonErrorPayload
} from "../src/core/errors.js";

describe("error model", () => {
  it("maps user input errors to exit code 2", () => {
    const error = normalizeError(new UserInputError("bad input"));
    expect(error.code).toBe("USER_INPUT");
    expect(error.exitCode).toBe(2);
  });

  it("maps unknown runtime errors to execution exit code 1", () => {
    const error = normalizeError(new Error("boom"));
    expect(error).toBeInstanceOf(ExecutionError);
    expect(error.exitCode).toBe(1);
  });

  it("validates output format values", () => {
    expect(normalizeOutputFormat("json")).toBe("json");
    expect(normalizeOutputFormat("text")).toBe("text");
    expect(() => normalizeOutputFormat("yaml")).toThrow('Invalid --format value "yaml"');
  });

  it("renders machine-readable JSON error payloads", () => {
    const payload = toJsonErrorPayload(new UserInputError("invalid value"));
    expect(payload).toEqual({
      error: {
        code: "USER_INPUT",
        type: "UserInputError",
        message: "invalid value",
        exitCode: 2
      }
    });
  });
});
