/**
 * Integration test: a REAL local CLI process through the production pipeline.
 *
 * Unlike the dry-run E2E, this spawns actual `node` processes via the shell
 * adapter and proves the whole chain: discovery-style checks -> permission
 * check -> real execution -> ToolExecution -> persistence -> observation ->
 * deviation -> state -> report -> release decision.
 */
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {
    AdapterKind,
    AdapterRegistry,
    type Check,
    type Checklist,
    CheckRunner,
    CycleState,
    CycleEngine,
    EvidenceSchema,
    FileStore,
    PermissionTier,
    RandomIdGenerator,
    ReleaseGate,
    ReleaseOutcome,
    ReportBuilder,
    ShellAdapter,
    SystemClock,
    ToolExecutionSchema
} from '../../src/index';
import {makeCheck, makeProcedure, makeProject} from '../fixtures';

const nodeCheck = (id: string, exitCode: number): Check => {
    return {
        ...makeCheck(),
        id: id,
        criticality: 'critical',
        action: {adapter: AdapterKind.Shell, params: {bin: 'node', args: ['-e', `process.exit(${exitCode})`]}, permissionTier: PermissionTier.TempTest},
        successCriterion: {kind: 'exitZero'}
    };
};

const checklist: Checklist = {
    id: 'cli.integration',
    version: '1.0.0',
    ruleVersion: '1.0.0',
    checks: [nodeCheck('cli.ok', 0), nodeCheck('cli.fail', 3)]
};

describe('real CLI integration through CycleEngine', () => {
    let root: string;

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'kyklos-realcli-'));
    });

    afterEach(async () => {
        await rm(root, {recursive: true, force: true});
    });

    it('runs real processes, persists the ToolExecution, and derives the release', async () => {
        const store = new FileStore(root);
        const runner = new CheckRunner(new AdapterRegistry().register(new ShellAdapter({allowlist: ['node']})));
        const engine = new CycleEngine({runner: runner, idGenerator: new RandomIdGenerator(), clock: new SystemClock(), store: store});

        const result = await engine.run({project: makeProject(), procedure: makeProcedure(), checklist: checklist});

        // A real process actually started and its real exit codes were captured.
        const byCheck = new Map(result.toolExecutions.map((exec) => [exec.checkId, exec]));
        expect(byCheck.get('cli.ok')?.exitCode).toBe(0);
        expect(byCheck.get('cli.fail')?.exitCode).toBe(3);

        // A failed process leads to a failed check and a failed cycle.
        const failObs = result.observations.find((obs) => obs.checkId === 'cli.fail');
        expect(failObs?.status).toBe('failed');
        expect(result.cycle.state).toBe(CycleState.Failed);

        // The ToolExecution is persisted and references cycle + check.
        const failExec = byCheck.get('cli.fail');
        const loaded = await store.getRecord('toolExecution', failExec?.id ?? 'x', ToolExecutionSchema);
        expect(loaded).toStrictEqual(failExec);
        expect(loaded.cycleId).toBe(result.cycle.id);
        expect(loaded.checkId).toBe('cli.fail');
        expect(loaded.outputComplete).toBe(true);

        // The report references the execution evidence, which is persisted.
        const report = ReportBuilder.build({cycle: result.cycle, observations: result.observations, deviations: result.deviations});
        const reportLine = report.checks.find((line) => line.checkId === 'cli.fail');
        expect(reportLine?.evidenceIds.length).toBeGreaterThan(0);
        const evidenceId = reportLine?.evidenceIds[0] ?? 'x';
        const evidence = await store.getRecord('evidence', evidenceId, EvidenceSchema);
        expect(evidence.source).toBe('tool_execution');

        // The release decision is derived from the real result.
        const decision = ReleaseGate.decide({cycle: result.cycle, ruleVersion: '1.0.0', decidedBy: 'gate', idGenerator: new RandomIdGenerator(), clock: new SystemClock()});
        expect(decision.outcome).toBe(ReleaseOutcome.Reject);
    });
});