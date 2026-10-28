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

Early development, pre-MVP. Milestone **M0 (project scaffold)** is in place:

- TypeScript (ESM, `NodeNext`, ES2022, strict)
- ESLint 9 + `@typescript-eslint` + `@stylistic` + `prefer-arrow` + `import`
- Vitest

The domain model and the deterministic cycle engine follow in M1–M4
(see the plan below).

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
