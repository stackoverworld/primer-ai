export const draftOutputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["mission", "architectureSummary", "initialModules", "apiSurface", "conventions", "qualityGates", "risks"],
  properties: {
    mission: { type: "string" },
    architectureSummary: {
      type: "array",
      minItems: 3,
      maxItems: 12,
      items: { type: "string" }
    },
    initialModules: {
      type: "array",
      minItems: 3,
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["path", "purpose"],
        properties: {
          path: { type: "string" },
          purpose: { type: "string" }
        }
      }
    },
    apiSurface: {
      type: "array",
      minItems: 2,
      maxItems: 20,
      items: { type: "string" }
    },
    conventions: {
      type: "array",
      minItems: 4,
      maxItems: 24,
      items: { type: "string" }
    },
    qualityGates: {
      type: "array",
      minItems: 3,
      maxItems: 12,
      items: { type: "string" }
    },
    risks: {
      type: "array",
      minItems: 2,
      maxItems: 12,
      items: { type: "string" }
    }
  }
} as const;

export const quickSetupOutputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["includeTesting", "includeLinting", "includeFormatting", "notes"],
  properties: {
    includeTesting: { type: "boolean" },
    includeLinting: { type: "boolean" },
    includeFormatting: { type: "boolean" },
    runtimeProfile: {
      type: "string",
      enum: ["bare", "express", "fastify"]
    },
    notes: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: { type: "string" }
    }
  }
} as const;
