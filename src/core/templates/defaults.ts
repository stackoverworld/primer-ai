import type { InitInput, ProjectPlan } from "../types.js";
import { isLandingPageProject } from "./shared.js";

export function defaultArchitectureSummary(input: InitInput): string[] {
  if (isLandingPageProject(input)) {
    return [
      "Use a static-first web architecture optimized for fast first paint and SEO.",
      "Organize page sections as focused feature modules with reusable UI primitives.",
      "Treat content blocks, CTA flows, and analytics events as typed contracts.",
      "Keep integrations optional and isolated (forms, analytics, maps, chat widgets)."
    ];
  }

  return [
    `Use a layered ${input.projectShape.replace("-", " ")} architecture with strict module boundaries.`,
    "Keep business rules isolated from framework/tooling concerns.",
    "Treat contracts and interfaces as first-class artifacts owned in docs + source.",
    "Prefer explicit composition roots and dependency injection over global state."
  ];
}

export function defaultApiSurface(input: InitInput): string[] {
  if (isLandingPageProject(input)) {
    return [
      "No first-party backend API in v1 (static marketing site).",
      "If lead/contact forms are used, document third-party provider payload and response schema.",
      "Define typed analytics event contracts for CTA clicks and conversion funnel steps."
    ];
  }

  if (input.projectShape === "web-app") {
    return [
      "UI-to-backend integration contract documented per feature.",
      "Typed request/response models shared between data layer and UI.",
      "Error model normalized into user-safe and operator-facing buckets."
    ];
  }

  return [
    "Health/readiness contract for deployment checks.",
    "Primary domain endpoints/resources with versioning strategy.",
    "Standardized error shape with machine-readable codes."
  ];
}

export function defaultConventions(): string[] {
  return [
    "Keep functions focused and side-effect boundaries explicit.",
    "Prefer domain naming over technical naming in module boundaries.",
    "Write tests for behavior, not implementation details.",
    "Do not bypass lint/test/build checks in normal flow.",
    "When adding architecture changes, add or update ADR entries."
  ];
}

export function defaultQualityGates(plan: ProjectPlan): string[] {
  return [
    "node scripts/check-agent-context.mjs",
    "node scripts/check-doc-freshness.mjs",
    "node scripts/check-skills.mjs",
    ...plan.verificationCommands,
    "manual smoke test for affected user flow"
  ];
}

export function defaultRisks(): string[] {
  return [
    "Context drift between implementation and project docs.",
    "Scope creep that bypasses module boundaries.",
    "Unverified API changes breaking downstream consumers."
  ];
}
