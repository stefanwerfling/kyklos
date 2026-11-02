# Kyklos

> 🇩🇪 Eine deutsche Übersetzung dieser Datei: [README.de.md](README.de.md)

**Kyklos** (Greek *κύκλος*, "cycle") is a deterministic verification, experience
and improvement engine for recurring technical procedures. It runs defined
checklists, records deviations, learns from past failures, and proposes
controlled improvements for future verification cycles.

The first domain is **safe software delivery** (preparation, backup &
restore, upgrade, rollback, deployment, release gate). The architecture is
designed to later cover server maintenance, backup verification, data
migrations and other recurring technical procedures.

## Core principle

Every verification cycle produces a reproducible, auditable record of the
checks that ran, their results, expected vs. actual state, deviations,
verifiable evidence (logs, test results, checksums), and the decisions taken.

Kyklos may **propose** improvements from experience. New rules never become
binding release criteria automatically — they require validation first.

## Status

The deterministic engine (M0–M7) and the orchestration layer (N1–N9) are
implemented and automated-tested (179 Vitest tests; `build`/`lint`/`typecheck`
green). The core runs with **no LLM**; an LLM, when present, is advisory only
and can never change a result.

Each capability is labelled by how far it actually goes:

| Capability | State |
|---|---|
| Domain model, versioned checklists, deterministic execution & gatekeeping | **implemented, automated-tested** |
| Playbook model & resolution (W1): versioned, composable playbooks that reference procedures/playbooks, resolve per target system, and compile to the existing checklist — engine unchanged | **implemented, automated-tested** (resolver, compiler, dependency-cycle detection, sealed-rule enforcement, ExecutionPlan provenance) |
| Workflow engine (W2): phases over cycles with dependencies, optional/recovery phases, phase-gate from the cycle state, rollback-on-failure, and **resume** via append-only PhaseRuns — each phase runs through the unchanged PlanExecutor/CycleEngine | **implemented, automated-tested** (WorkflowStateResolver, WorkflowEngine, ResumeManager; real PlanExecutor integration) |
| Task & delegation model (W3): execution modes (automatic/llm-assisted/manual/delegated/approval), a derived task lifecycle, fail-closed assignment/feedback, and real approvals that back release decisions — a human task completes only via validated feedback/approval (never a flag) and bridges to an Observation + `manually_confirmed` evidence | **implemented, automated-tested** (TaskStateResolver, TaskService, ApprovalService; ReleaseGate unchanged) |
| Layered knowledge & learning (W4): knowledge scoped global/system/technology/project via composed FileStores (precedence project→global), cross-scope contradiction detection, a Diagnosis entity, controlled promotion (validated + secret-free + authorized approval), and secret-safe export/import | **implemented, automated-tested** (LayeredKnowledgeStore, LessonRepository, ContradictionDetector, KnowledgePromotion, KnowledgeSync; reuses LessonSanitizer/LessonTransfer/Approval) |
| Environments & update waves (W5): content-addressed artifacts (the digest is the identity, so the tested digest can be enforced as the deployed one), an environment registry over target systems, and workflow rollouts across ordered waves where a wave passes only if every environment passed and a failed wave blocks the rest | **implemented, automated-tested** (ArtifactRegistry, ArtifactVerifier, EnvironmentRegistry, WaveController; each environment runs through the unchanged WorkflowEngine) |
| Approvals & roles / RBAC (W6): a versioned Role (capabilities + a permission-tier ceiling) and a single fail-closed decision point that unions an actor's capabilities, so a production release needs its own capability and the approver may not be the actor who performed the work (separation of duties) | **implemented, automated-tested** (Role, Capability, RoleRegistry, AuthorizationService; wired fail-closed into ApprovalService/TaskService, ReleaseGate unchanged) |
| Resume, notify & report (W7): a rollout resumes from its append-only records (already-passed environments are reused, a failed/blocked environment is retried), an advisory notifier that can never change a result (dispatch guarded, messages redacted), and a deterministic rollout report derived through the shared wave-state resolver | **implemented, automated-tested** (WaveResumeManager, WaveStateResolver, Notifier/NullNotifier/RecordingNotifier, RolloutReportBuilder; reuses LessonSanitizer, mirrors the W2 ResumeManager) |
| Autonomous planning (W8): an LLM may propose a whole playbook/workflow, but the proposal is never binding — it is stored as a draft (origin `llm_assertion`), validated deterministically (must be a draft, secret-free, and structurally sound via the unchanged compiler/dependency graph), and becomes runnable only when an actor with the `PublishPlan` capability publishes it | **implemented, automated-tested** (LlmAdvisor.proposePlan, PlanValidator, PlanProposalService; reuses PlaybookCompiler/DependencyGraph/LessonSanitizer/AuthorizationService, engines unchanged) |
| Release decision, deviations/incidents, similarity search, improvement proposals, lesson transfer | **implemented, automated-tested** |
| Evidence provenance + `ToolExecution` through the full cycle (persisted, referenced by the report) | **implemented, automated-tested** (real `node` process integration test) |
| CLI adapter + discovery (package.json scripts) | **implemented, automated-tested**; a real `npm run typecheck` was executed and recorded |
| Permission policy (fail-closed, tier from the trusted action) | **implemented, automated-tested** |
| Git adapter (read-only) | **implemented, automated-tested** (real `git`) |
| Browser adapter + `browserHealthy` (strict) + URL scheme/host guard | **implemented, automated-tested**; a real Chromium run was **manually demonstrated** via browser automation. A `PlaywrightDriver` is an **open integration** (Playwright not installed) |
| Emulator adapter | **interface + availability check only**; running an app/user flow is an **open integration**. No AVD in this environment → **not executable** here |
| HTML cycle report (escaped, evidence↔analysis links) | **implemented, automated-tested**. A richer interactive UI is **planned** |
| LLM advisor | **interface only** (`NullLlmAdvisor`); a real Claude-API advisor is **planned** |
| Makefile/CI discovery, Docker/package-manager/backup adapters, parallelism/caching/cost | **planned** |

Legend: *implemented* = code present; *automated-tested* = covered by Vitest;
*manually demonstrated* = run once by a human/agent, not in CI; *interface only*
= contract without a production driver; *not executable here* = missing
infrastructure; *planned* = not built. See the orchestration plan for details.

## Language policy

**English is the primary (standard) language** for all code, identifiers and
documentation. **German is provided as a translation** (files are suffixed
`.de`, e.g. [`README.de.md`](README.de.md)).

## Getting started

```bash
npm install
npm run build       # compile TypeScript to dist/
npm run typecheck   # type-check without emitting
npm run lint        # ESLint
npm test            # Vitest
```

## Example: a release run

The bundled `ReleaseExample` builds a versioned A–E release checklist (preparation,
backup & restore, upgrade, rollback, deployment). Running it with the dry-run registry
simulates every adapter, so the whole checklist runs end to end **without touching a
real system** and produces an auditable, append-only cycle record. Group F (release)
is the `ReleaseGate` applied to the resulting cycle.

```ts
import {
    CheckRunner, CycleEngine, FileStore, RandomIdGenerator,
    ReleaseExample, ReleaseGate, SystemClock
} from 'kyklos';

// Dry run: every adapter is simulated — nothing is executed for real.
const runner = new CheckRunner(ReleaseExample.dryRunRegistry());
const engine = new CycleEngine({
    runner: runner,
    idGenerator: new RandomIdGenerator(),
    clock: new SystemClock(),
    store: new FileStore('./.kyklos')
});

const result = await engine.run({
    project: ReleaseExample.project(),
    procedure: ReleaseExample.procedure(),
    checklist: ReleaseExample.checklist()
});

const decision = ReleaseGate.decide({
    cycle: result.cycle,
    ruleVersion: '1.0.0',
    decidedBy: 'release-gate',
    idGenerator: new RandomIdGenerator(),
    clock: new SystemClock()
});

console.log(result.cycle.state, decision.outcome); // e.g. "passed" "approve"
```

For a real run, swap `ReleaseExample.dryRunRegistry()` for an `AdapterRegistry` of real
adapters — `ShellAdapter` (with an allow-list + timeout), `HttpAdapter`, `ManualAdapter`.
A critical check that is skipped, not executable or unknown never auto-passes: it forces
`manual_release_required`, which the gate only clears with an authorized, justified override.

## Documentation

- Analysis & plan — repository status, MVP scope, domain model, cycle flow,
  example release checklist, cross-project lesson reuse, risks, and a
  prioritized implementation plan: [`docs/kyklos-analysis-and-plan.md`](docs/kyklos-analysis-and-plan.md)
  (German translation: [`docs/kyklos-analysis-and-plan.de.md`](docs/kyklos-analysis-and-plan.de.md)).

## License

MIT © Stefan Werfling
