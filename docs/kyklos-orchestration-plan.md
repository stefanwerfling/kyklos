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

### N3 — Git adapter (read-only)  ✅ done
- `GitAdapter` (`src/Runner`): composes the shell adapter (bin pinned to `git`), allows only read
  subcommands (status/describe/log/diff/rev-parse/branch/show/remote/config/ls-files), refuses writes;
  `permissionTier: read`.
- **Acceptance (met, verified 2026-10-28):** real `git rev-parse --abbrev-ref HEAD` runs and is
  captured; a write subcommand (`commit`) yields `not_executable`.

### N4 — Browser adapter  ✅ done (library + real-browser proof)
- `BrowserAdapter` + `BrowserDriver` contract + `BrowserInspection` (`src/Runner`); no hard Playwright
  dependency — inject a driver, else `not_executable` with "`npm i -D playwright`". New `browserHealthy`
  success criterion: a page passes only if reachable, console-error-free, request-error-free and the
  title matches — a 200 alone is never a pass.
- **Real browser proof (this session):** served a local page and drove **real Chromium** via the
  claude-in-chrome MCP — read title/DOM/console (0 errors), executed the click user-flow (`idle`→`clicked`,
  console logged the click), screenshot captured. Those real observations were then run back through
  `BrowserAdapter` + `browserHealthy` → passed; a console-error variant → failed.
- **Acceptance (met):** a browser test ran in a real browser; the healthy/broken distinction holds.
  Playwright is not installed → a `PlaywrightDriver` is the documented production integration.

### N5 — Emulator adapter (capability-gated)  ✅ done
- `EmulatorAdapter` + `EmulatorDriver` contract + `AdbEmulatorDriver` (real `adb devices` via the
  allow-listed shell adapter) — `src/Runner`. No driver / no device → `not_executable` with a concrete
  next step.
- **Acceptance (met, verified 2026-10-28):** with the real adb driver it honestly reports
  `no_device_or_avd` (no AVD in this environment); a fake driver with a device executes. No emulator
  result is ever reported without a device.

### N6 — Fix cycle (structured error analysis + re-verification)  ✅ done
- `FixCycle` (`src/Learning`): reproduce the original failure → search similar prior incidents
  (`IncidentRepository`) → apply a minimal external change (callback, stays in approved scope) → re-run →
  re-evaluate whether the original deviation is gone → record residual risk. A fix that never reproduced
  is never claimed as verified.
- **Acceptance (met, verified 2026-10-28):** a reproducible failure is reproduced, fixed and re-verified
  (resolved); a no-op fix stays `unresolved`; a non-reproducing case is `not_reproducible`; prior
  incidents surface by signature.

### N7 — Orchestrator + LLM boundary (optional, advisory only)  ✅ done
- `Orchestrator` (`src/Orchestration`) runs the check plan deterministically and derives the cycle state
  ONLY from runner results via the gatekeeping resolver; records per-cycle metrics (checkCount,
  durationMs, llmCalls). `LlmAdvisor` interface + `NullLlmAdvisor` return suggestions/diagnoses only —
  never an `Observation` or a status.
- **Acceptance (met, verified 2026-10-28):** the full cycle runs with no advisor (llmCalls 0); a
  malicious advisor claiming "mark everything passed" leaves a failed state Failed — the LLM cannot flip
  a result. Result reuse / parallelism of independent checks are later refinements.

### N8 — Report/UI  ✅ done (deterministic report, richer UI later)
- `ReportBuilder` (machine-readable `CycleReport`: checks linked to their deviations, open risks) +
  `HtmlReportRenderer` (self-contained HTML; all dynamic text HTML-escaped — untrusted content is data,
  never markup; failing checks link to their deviation anchors) — `src/Report`.
- **Acceptance (met, verified 2026-10-28):** builds a report, links checks↔deviations, renders HTML that
  escapes a `<script>` payload, is deterministic; proven on a real cycle (12 checks, 1 deviation →
  passed_with_deviations → approve, open risk listed). A richer interactive UI is a later milestone.

### N9 — Security/audit hardening + E2E  ✅ done (first pass)
- `PermissionPolicy` (tier ceiling; `src/Security`) enforced in `ProcessRunner`: an action above the
  ceiling is recorded `not_executable` without running — never silently passed or executed. Untrusted
  content is treated as data (HTML escaping N8; adapter allow-lists; advisory-only LLM N7). An E2E test
  runs discovery → engine → gatekeeping → report → render → release.
- **Acceptance (met, verified 2026-10-28):** permission denial blocks a too-high tier; the full E2E chain
  passes for a clean run (approve) and a failing run (reject with open risks); 166 tests green.
- Follow-ups: destructive/production actions requiring an explicit approval + restore-path workflow,
  and broader adapter-level tier declaration, remain to harden further.

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
