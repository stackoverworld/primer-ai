## Initial Risks
- Command handlers accumulating business logic can break agent predictability and test isolation.
- Non-deterministic factors (clock, locale, filesystem ordering) can cause flaky tests and unstable outputs.
- Unversioned JSON contracts may break Codex integrations silently as fields evolve.
- Config sprawl across file/env/flags can create ambiguous behavior without strict precedence enforcement.
- Docs drift between ADRs, runbooks, and implementation can degrade onboarding and incident response.
- Overly broad runbooks can become stale; scope creep reduces operational usefulness.
