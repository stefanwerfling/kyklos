# Kyklos — LLM Orchestration & Automated Verification: Analysis & Plan

> 🇩🇪 German translation: [kyklos-orchestration-plan.de.md](kyklos-orchestration-plan.de.md).
> English is the primary (standard) version. Date: 2026-10-28.

Extends the Kyklos engine (M0–M7, already built) with a controlled, auditable
orchestration layer that runs real tools, captures real evidence, and keeps the
LLM strictly advisory. **The deterministic core must keep working with no LLM.**

---

## 1. What already exists (reuse, do not rebuild)

| Capability | Where | Covers spec §|
|---|---|---|
| Adapter abstraction (manual/shell/http/dry-run) with timeout + structured outcome | `src/Runner` | §3 (adapter contract) |
| Deterministic cycle execution + 6-status mapping | `CycleEngine`, `CheckRunner` | §4 |
| Gatekeeping (critical gate never auto-passes) | `CycleStateResolver` | §4, §9 |
| Deterministic release decision from results + override | `ReleaseGate` | §9 |
| Evidence (sha256), Observation, Deviation, append-only + immutable store | `src/Domain`, `FileStore` | §9, §11 |
| Incident signatures + similarity search (no AI) | `src/Learning` | §7, §8 |
| Validation-gated improvement proposals | `ProposalService`, `ChecklistAmender` | §7, §8 |
| Cross-project lesson transfer + secret/PII block | `LessonTransfer`, `LessonSanitizer` | §8, §11 |
| Core already runs without any LLM | whole engine | §10 |

The spec is largely an **extension**, not a rewrite: new tool adapters, CLI test
discovery, browser/emulator adapters, an evidence-provenance tier, tool-execution
records, a fix cycle, an optional LLM advisor boundary, and a UI.

## 2. Runtime capability inventory (probed 2026-10-28)

| Tool | Available | Use for Kyklos |
|---|---|---|
| node / npm / npx / git / make / docker / python3 / java / rustc | yes | CLI + git adapters (real, now) |
| chromium / google-chrome / firefox (binaries) | yes | real browsers present |
| Playwright (npm) | **no** | browser adapter needs `npm i -D playwright`; until then → not_executable |
| adb | yes | Android control possible |
| `emulator` binary / AVD | **no** | **no emulator run possible → report not_executable, never claim a run** |
| flutter | yes (no AVD) | Flutter path possible only once a device/AVD exists |
| claude-in-chrome MCP | yes (agent session) | live browser demonstration during a session, recorded as evidence |

**Rule honored:** a tool that is missing yields a `not_executable` check with a
concrete alternative; it is never silently marked passed.

## 3. Key new domain concepts (small, additive)

- `EvidenceSource` — provenance tier of a piece of evidence, so an LLM claim can
  never masquerade as a verified result (§9):
  `llm_assertion` · `tool_execution` · `machine_verified` · `manually_confirmed` · `not_executable`.
- `PermissionTier` — the authority a tool action needs (§11):
  `read` · `temp_test` · `local_write` · `shared` · `external` · `production`.
- `ToolExecution` — the concrete execution record every result traces back to (§9):
  adapter, command, exitCode, status, startedAt/endedAt, durationMs, truncated
  stdout/stderr + their sha256, permissionTier, cycleId, checkId.
- `ResultKind` extends the six statuses with `partial` where a runner reports it (§4).

## 4. Milestones (grounded in the actual environment)

> Each milestone: small, reviewable, green `lint`/`typecheck`/`test`/`build`.
> Start with the real end-to-end path; add adapters only where the environment supports them.

### N1 — Evidence provenance, permission tiers, tool-execution record  ✅ done
- `EvidenceSource`, `PermissionTier` enums; `source` on `Evidence`; `ToolExecution` schema
  (`src/Domain`); `ToolExecutionRecorder` (truncate for display, sha256 over full output),
  `EvidenceFactory` (`fromToolExecution` / `llmAssertion` / `notExecutable`) — `src/Execution`.
- **Acceptance (met, verified 2026-10-28):** executed actions yield a `ToolExecution` +
  `Evidence{source: tool_execution}`; an LLM statement can only be `Evidence{source: llm_assertion}`;
  not-executable checks keep a `not_executable` evidence record; 134 tests green.

### N2 — Command discovery + CLI test run (the real durchgängiger Pfad)  ✅ done
- `CommandDiscovery` (reads `package.json` scripts; orders cheap→expensive: lint → typecheck →
  test → build/compile; invents nothing), `ProcessRunner` (runs via the allow-listed shell adapter,
  times it, builds a `ToolExecution`, maps non-executed → `not_executable`) — `src/Execution`.
- **Acceptance (met, verified 2026-10-28):** proven by a REAL run against Kyklos's own package.json —
  discovered 5 CLI checks and executed `npm run typecheck` (exit 0, status passed, durationMs 1347,
  `source: tool_execution`). Makefile discovery is a follow-up. Full CycleEngine integration of
  ToolExecution persistence is a later step (N7).

### N3 — Git adapter (read-only)
- `GitAdapter` (status/describe/log/diff --stat), `permissionTier: read`.
- **Acceptance:** real git facts captured as `tool_execution` evidence.

### N4 — Browser adapter
- `BrowserAdapter` contract + `PlaywrightDriver` behind an optional `playwright` dependency; if
  absent → `not_executable` with "`npm i -D playwright`" as the concrete alternative. Checks: core
  user flow, DOM/visible state, console errors, failed requests, screenshot evidence.
- A real browser run is demonstrated this session via the claude-in-chrome MCP against a locally
  served page, recorded as evidence. **Never claim a browser run that did not happen.**
- **Acceptance:** a browser test actually runs in a real browser where the environment supports it;
  a 200 status alone is never accepted as proof of a working UI.

### N5 — Emulator adapter (capability-gated)
- `EmulatorAdapter` contract + Android(adb) driver; detects no running device/AVD → `not_executable`,
  documented. **No emulator result is ever reported without a nachweisbarer emulator run.**

### N6 — Fix cycle (structured error analysis + re-verification)
- `FixCycle`: capture failure → reproduce → smallest repro → search prior incidents → ranked
  hypotheses with uncertainty → minimal change (proposal; implementation stays in approved scope) →
  re-run affected checks → regression → re-evaluate the original deviation → record residual risk.
- **Acceptance:** a reproducible failure is detected, a fix is re-verified, and the original
  deviation is re-evaluated after the fix; non-executed checks stay visible.

### N7 — Orchestrator + LLM boundary (optional, advisory only)
- `Orchestrator` runs deterministic checks with no LLM, records cost/runtime per cycle, reuses valid
  prior results, runs affected-then-regression, parallelizes independent safe checks. `LlmAdvisor`
  interface returns only suggestions/plans — it can never emit an `Observation` or change a status.
- **Acceptance:** full cycle runs with the LLM disabled; the LLM can never flip a result.

### N8 — Report/UI
- Start with a deterministic machine-readable + HTML report of a cycle (status, checks, evidence,
  deviations, decision, similar prior cases, open risks) with working links evidence↔analysis.
  A richer interactive UI follows.

### N9 — Security/audit hardening + E2E
- Enforce `PermissionTier` on every adapter; treat repo/web/log content as untrusted data (never
  instructions); destructive/production actions require explicit approval + a restore path; E2E tests.

## 5. Security & anti-false-success (cross-cutting, from day one)

- Separation of `EvidenceSource` tiers is the backbone: the LLM never changes a status by assertion;
  release is derived deterministically by `ReleaseGate` from results + checklist version + criticality.
- Untrusted content (repos, pages, logs, test output) is data, not instructions; it cannot widen the
  agent's permission or scope.
- Missing tool → `not_executable` + concrete alternative, never silent pass.

## 6. This session

Deliver N1 + N2 (the real end-to-end CLI path with provenance and execution records), tested and
green, plus a recorded real run of Kyklos's own scripts. N3+ follow in small steps. UI (N8) and the
real LLM wiring (N7) are later, larger milestones.
