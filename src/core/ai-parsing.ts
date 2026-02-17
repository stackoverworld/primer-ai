import { z } from "zod";

import type { AIDraft, AiQuickSetupPlan } from "./types.js";

const draftSchema = z.object({
  mission: z.string().min(10).max(400),
  architectureSummary: z.array(z.string().min(3)).min(3).max(12),
  initialModules: z
    .array(
      z.object({
        path: z.string().min(2).max(120),
        purpose: z.string().min(4).max(220)
      })
    )
    .min(3)
    .max(20),
  apiSurface: z.array(z.string().min(3)).min(2).max(20),
  conventions: z.array(z.string().min(3)).min(4).max(24),
  qualityGates: z.array(z.string().min(3)).min(3).max(12),
  risks: z.array(z.string().min(3)).min(2).max(12)
});

const quickSetupSchema = z.object({
  includeTesting: z.boolean(),
  includeLinting: z.boolean(),
  includeFormatting: z.boolean(),
  runtimeProfile: z.enum(["bare", "express", "fastify"]).optional(),
  notes: z.array(z.string().min(3)).min(1).max(8)
});

function pullCodeBlockCandidates(raw: string): string[] {
  const candidates: string[] = [];
  const regex = /```(?:json)?\s*([\s\S]*?)```/gi;

  for (;;) {
    const match = regex.exec(raw);
    if (!match) break;
    if (match[1]) candidates.push(match[1].trim());
  }

  return candidates;
}

function pullBalancedJsonCandidates(raw: string, openChar: "{" | "[", closeChar: "}" | "]"): string[] {
  const candidates: string[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (!char) continue;

    if (start === -1) {
      if (char === openChar) {
        start = index;
        depth = 1;
        inString = false;
        escapeNext = false;
      }
      continue;
    }

    if (inString) {
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      if (char === "\\") {
        escapeNext = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === openChar) {
      depth += 1;
      continue;
    }

    if (char === closeChar) {
      depth -= 1;
      if (depth === 0) {
        candidates.push(raw.slice(start, index + 1).trim());
        start = -1;
      }
    }
  }

  return candidates;
}

function pullBraceCandidates(raw: string): string[] {
  return [...pullBalancedJsonCandidates(raw, "{", "}"), ...pullBalancedJsonCandidates(raw, "[", "]")];
}

function parseJsonLikeString(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return value;

  const candidates = [trimmed, ...pullCodeBlockCandidates(trimmed), ...pullBraceCandidates(trimmed)];

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      continue;
    }
  }

  return value;
}

function normalizePayload(payload: unknown): unknown {
  if (typeof payload === "string") {
    const jsonLike = parseJsonLikeString(payload);
    if (jsonLike === payload) return payload;
    return normalizePayload(jsonLike);
  }

  if (Array.isArray(payload)) {
    return payload.map((item) => normalizePayload(item));
  }

  if (!payload || typeof payload !== "object") return payload;

  const record = payload as Record<string, unknown>;
  if (record.structured_output && typeof record.structured_output === "object") {
    return normalizePayload(record.structured_output);
  }

  if (record.draft && typeof record.draft === "object") {
    return normalizePayload(record.draft);
  }

  if (record.result && typeof record.result === "string") {
    const parsed = parseJsonLikeString(record.result);
    if (parsed !== record.result) return normalizePayload(parsed);
  }

  if (record.output && typeof record.output === "string") {
    const parsed = parseJsonLikeString(record.output);
    if (parsed !== record.output) return normalizePayload(parsed);
  }

  return payload;
}

export function parseWithSchema<T>(raw: string, schema: z.ZodType<T>): T | null {
  const candidates = [raw.trim(), ...pullCodeBlockCandidates(raw), ...pullBraceCandidates(raw)];

  for (const candidate of candidates) {
    if (!candidate) continue;

    try {
      const parsed = normalizePayload(JSON.parse(candidate));
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const normalizedItem = normalizePayload(item);
          const validatedItem = schema.safeParse(normalizedItem);
          if (validatedItem.success) return validatedItem.data;
        }
        continue;
      }
      const validated = schema.safeParse(parsed);
      if (validated.success) return validated.data;
    } catch {
      continue;
    }
  }

  return null;
}

export function parseDraftFromOutput(raw: string): AIDraft | null {
  return parseWithSchema(raw, draftSchema);
}

export function parseQuickSetupFromOutput(raw: string): AiQuickSetupPlan | null {
  return parseWithSchema(raw, quickSetupSchema);
}
