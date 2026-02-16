import { inferVerificationCommands } from "./refactor-policy.js";
import type { InitInput, ProjectPlan, ProjectShape, RepositoryArea, ScopedInstruction } from "./types.js";

function inferLaunchCommand(shape: ProjectShape, techStack: string): string {
  const stack = techStack.toLowerCase();

  if (stack.includes("python")) {
    if (shape === "api-service") return "uvicorn src.main:app --reload";
    return "python -m src.main";
  }

  if (stack.includes("go")) return "go run ./cmd/main.go";
  if (stack.includes("rust")) return "cargo run";

  if (shape === "web-app") return "npm run dev";
  if (shape === "api-service") return "npm run dev";
  if (shape === "monorepo") return "npm run dev --workspaces";
  return "npm run dev";
}

interface ShapePlan {
  directories: string[];
  scopedInstructions: ScopedInstruction[];
  repositoryAreas: RepositoryArea[];
}

function planForShape(shape: ProjectShape): ShapePlan {
  switch (shape) {
    case "web-app":
      return {
        directories: [
          "src/app",
          "src/features",
          "src/components",
          "src/lib",
          "src/styles",
          "tests/unit",
          "tests/e2e",
          "scripts",
          "docs/decisions",
          "docs/runbooks"
        ],
        scopedInstructions: [
          { directory: "src", focus: "Application code, boundaries, and dependency direction." },
          { directory: "tests", focus: "Coverage strategy, deterministic tests, and fixture hygiene." }
        ],
        repositoryAreas: [
          { path: "src/app", purpose: "Composition root and app bootstrap." },
          { path: "src/features", purpose: "Feature-oriented modules and use-case logic." },
          { path: "src/components", purpose: "Reusable UI building blocks." },
          { path: "src/lib", purpose: "Shared utilities and infrastructure adapters." },
          { path: "tests", purpose: "Unit, integration, and end-to-end tests." }
        ]
      };
    case "api-service":
      return {
        directories: [
          "src/http",
          "src/modules",
          "src/domain",
          "src/lib",
          "src/contracts",
          "tests/unit",
          "tests/integration",
          "scripts",
          "docs/decisions",
          "docs/runbooks"
        ],
        scopedInstructions: [
          { directory: "src/http", focus: "Transport-layer concerns and request validation." },
          { directory: "src/modules", focus: "Business capabilities and bounded contexts." },
          { directory: "tests", focus: "Contract, integration, and regression tests." }
        ],
        repositoryAreas: [
          { path: "src/http", purpose: "Routing, handlers, and protocol adapters." },
          { path: "src/modules", purpose: "Use cases and business workflows." },
          { path: "src/domain", purpose: "Core entities, invariants, and policies." },
          { path: "src/contracts", purpose: "API schemas and type-safe contracts." },
          { path: "tests", purpose: "Unit and integration suites." }
        ]
      };
    case "library":
      return {
        directories: [
          "src",
          "src/internal",
          "examples",
          "tests",
          "scripts",
          "docs/decisions",
          "docs/runbooks"
        ],
        scopedInstructions: [
          { directory: "src", focus: "Public API stability and backward compatibility." },
          { directory: "tests", focus: "Behavioral coverage and compatibility guarantees." }
        ],
        repositoryAreas: [
          { path: "src", purpose: "Public library API and exported modules." },
          { path: "src/internal", purpose: "Private implementation details." },
          { path: "examples", purpose: "Consumer-facing usage samples." },
          { path: "tests", purpose: "Contract and regression tests." }
        ]
      };
    case "cli-tool":
      return {
        directories: [
          "src/commands",
          "src/lib",
          "tests",
          "scripts",
          "docs/decisions",
          "docs/runbooks"
        ],
        scopedInstructions: [
          { directory: "src/commands", focus: "Command UX, validation, and error ergonomics." },
          { directory: "src/lib", focus: "Core orchestration and side-effect boundaries." },
          { directory: "tests", focus: "End-to-end command scenarios and edge cases." }
        ],
        repositoryAreas: [
          { path: "src/commands", purpose: "Command definitions and argument parsing." },
          { path: "src/lib", purpose: "Shared services used by commands." },
          { path: "tests", purpose: "CLI behavior validation." },
          { path: "scripts", purpose: "Automation helpers." }
        ]
      };
    case "monorepo":
      return {
        directories: [
          "apps/web/src",
          "apps/api/src",
          "packages/shared/src",
          "packages/config",
          "tests/e2e",
          "scripts",
          "docs/decisions",
          "docs/runbooks"
        ],
        scopedInstructions: [
          { directory: "apps/web", focus: "Frontend delivery, UX constraints, and feature modules." },
          { directory: "apps/api", focus: "Backend services, contracts, and data integrity." },
          { directory: "packages/shared", focus: "Shared contracts and reusable building blocks." },
          { directory: "tests", focus: "Cross-package integration and release checks." }
        ],
        repositoryAreas: [
          { path: "apps/web", purpose: "User-facing web application." },
          { path: "apps/api", purpose: "Service/API runtime." },
          { path: "packages/shared", purpose: "Shared models, clients, and utilities." },
          { path: "packages/config", purpose: "Shared tooling presets." },
          { path: "tests/e2e", purpose: "Cross-application tests." }
        ]
      };
    case "custom":
    default:
      return {
        directories: [
          "src",
          "tests",
          "scripts",
          "docs/decisions",
          "docs/runbooks"
        ],
        scopedInstructions: [
          { directory: "src", focus: "Core product logic and implementation details." },
          { directory: "tests", focus: "Regression prevention and behavior confidence." }
        ],
        repositoryAreas: [
          { path: "src", purpose: "Main source code." },
          { path: "tests", purpose: "Validation and automated checks." },
          { path: "scripts", purpose: "Operational and maintenance scripts." }
        ]
      };
  }
}

export function buildProjectPlan(input: InitInput): ProjectPlan {
  const shapePlan = planForShape(input.projectShape);
  const verificationCommands = inferVerificationCommands(input.techStack, input.projectShape);
  const launchCommand = inferLaunchCommand(input.projectShape, input.techStack);

  return {
    directories: shapePlan.directories,
    scopedInstructions: shapePlan.scopedInstructions,
    repositoryAreas: shapePlan.repositoryAreas,
    verificationCommands,
    launchCommand
  };
}
