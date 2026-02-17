import { describe, expect, it } from "vitest";

import { __internal } from "../src/core/ai.js";
import { parseQuickSetupFromOutput } from "../src/core/ai-parsing.js";

describe("ai output parsing", () => {
  it("parses Claude JSON wrapper with fenced JSON in result", () => {
    const raw = JSON.stringify({
      type: "result",
      subtype: "success",
      result:
        "```json\n{\"mission\":\"Build finance app\",\"architectureSummary\":[\"Layered architecture\",\"Contracts first\",\"Scoped docs\"],\"initialModules\":[{\"path\":\"src/app\",\"purpose\":\"composition root\"},{\"path\":\"src/features\",\"purpose\":\"feature modules\"},{\"path\":\"src/lib\",\"purpose\":\"shared helpers\"}],\"apiSurface\":[\"GET /health\",\"POST /events\"],\"conventions\":[\"tests required\",\"small diffs\",\"explicit boundaries\",\"update docs\"],\"qualityGates\":[\"npm run lint\",\"npm run test\",\"npm run build\"],\"risks\":[\"doc drift\",\"scope creep\"]}\n```"
    });

    const parsed = __internal.parseDraftFromOutput(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.mission).toBe("Build finance app");
    expect(parsed?.initialModules.length).toBeGreaterThanOrEqual(3);
  });

  it("parses Claude structured_output envelope", () => {
    const raw = JSON.stringify({
      type: "result",
      subtype: "success",
      structured_output: {
        mission: "Build finance app",
        architectureSummary: ["Layered architecture", "Contracts first", "Scoped docs"],
        initialModules: [
          { path: "src/app", purpose: "composition root" },
          { path: "src/features", purpose: "feature modules" },
          { path: "src/lib", purpose: "shared helpers" }
        ],
        apiSurface: ["GET /health", "POST /events"],
        conventions: ["tests required", "small diffs", "explicit boundaries", "update docs"],
        qualityGates: ["npm run lint", "npm run test", "npm run build"],
        risks: ["doc drift", "scope creep"]
      }
    });

    const parsed = __internal.parseDraftFromOutput(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.apiSurface[0]).toBe("GET /health");
  });

  it("parses Codex transcript output with trailing JSON object", () => {
    const raw = `
OpenAI Codex v0.101.0 (research preview)
--------
user
Return architecture JSON
thinking
**Generating structured payload**
codex
{"mission":"Build finance app","architectureSummary":["Layered architecture","Contracts first","Scoped docs"],"initialModules":[{"path":"src/http","purpose":"transport layer"},{"path":"src/modules","purpose":"business workflows"},{"path":"src/domain","purpose":"core models"}],"apiSurface":["GET /health","POST /transactions"],"conventions":["tests required","small diffs","explicit boundaries","update docs"],"qualityGates":["npm run lint","npm run test","npm run build"],"risks":["doc drift","scope creep"]}
tokens used
10938
{"mission":"Build finance app","architectureSummary":["Layered architecture","Contracts first","Scoped docs"],"initialModules":[{"path":"src/http","purpose":"transport layer"},{"path":"src/modules","purpose":"business workflows"},{"path":"src/domain","purpose":"core models"}],"apiSurface":["GET /health","POST /transactions"],"conventions":["tests required","small diffs","explicit boundaries","update docs"],"qualityGates":["npm run lint","npm run test","npm run build"],"risks":["doc drift","scope creep"]}
`;

    const parsed = __internal.parseDraftFromOutput(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.initialModules[0]?.path).toBe("src/http");
  });

  it("parses quick-setup payload wrapped in an array", () => {
    const raw = JSON.stringify([
      {
        includeTesting: true,
        includeLinting: true,
        includeFormatting: true,
        runtimeProfile: "express",
        notes: ["Enable deterministic defaults"]
      }
    ]);

    const parsed = parseQuickSetupFromOutput(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.includeTesting).toBe(true);
    expect(parsed?.runtimeProfile).toBe("express");
  });
});
