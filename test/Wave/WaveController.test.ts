/**
 * Integration: WaveController rolls a workflow across environments in ordered
 * waves over the real WorkflowEngine (W2). A fake PhaseExecutor drives each
 * environment's outcome deterministically from its target id, so the wave gate
 * and the "failed wave blocks the rest" guarantee can be asserted without a
 * real system.
 */
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {
    type CycleRunResult,
    CycleState,
    type Environment,
    EnvironmentKind,
    EnvironmentRunSchema,
    type ExecutionPlan,
    FileStore,
    type PhaseExecutor,
    type PhaseRoot,
    type Project,
    type TargetSystem,
    WaveController,
    WaveState,
    WorkflowEngine
} from '../../src/index';
import {FixedClock, SequentialIdGenerator} from '../doubles';
import {makeCycle, makeExecutionPlan, makeProject, makeWorkflow} from '../fixtures';

/**
 * Executes a phase as a cycle whose state is chosen per target id.
 */
class FakePhaseExecutor implements PhaseExecutor {
    protected readonly _stateByTarget: Map<string, CycleState>;

    public constructor(stateByTarget: Map<string, CycleState>) {
        this._stateByTarget = stateByTarget;
    }

    public run(input: {project: Project; target: TargetSystem; root: PhaseRoot;}): Promise<{plan: ExecutionPlan; cycle?: CycleRunResult;}> {
        const state = this._stateByTarget.get(input.target.id) ?? CycleState.Passed;
        const cycle: CycleRunResult = {
            cycle: {...makeCycle(), id: `cyc-${input.target.id}`, state: state},
            observations: [],
            deviations: [],
            toolExecutions: [],
            evidence: []
        };
        return Promise.resolve({plan: {...makeExecutionPlan(), id: `plan-${input.target.id}`}, cycle: cycle});
    }
}

const envA: Environment = {id: 'env-a', name: 'test-a', kind: EnvironmentKind.Test, targetSystemId: 'tgt-a', labels: undefined, address: undefined};
const envB: Environment = {id: 'env-b', name: 'prod-b', kind: EnvironmentKind.Production, targetSystemId: 'tgt-b', labels: undefined, address: undefined};
const resolveTarget = (environment: Environment): TargetSystem => {
    return {id: environment.targetSystemId, os: 'debian', osVersion: undefined, technologies: []};
};

const makeController = (store: FileStore, stateByTarget: Map<string, CycleState>): WaveController => {
    const engine = new WorkflowEngine({executor: new FakePhaseExecutor(stateByTarget), idGenerator: new SequentialIdGenerator(), clock: new FixedClock()});
    return new WaveController({engine: engine, idGenerator: new SequentialIdGenerator(), clock: new FixedClock(), store: store});
};

describe('WaveController rollout across waves', () => {
    let dir: string;
    let store: FileStore;

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), 'kyklos-wave-'));
        store = new FileStore(dir);
    });

    afterEach(async () => {
        await rm(dir, {recursive: true, force: true});
    });

    it('runs the next wave once the prior one passed', async () => {
        const controller = makeController(store, new Map());
        const result = await controller.run({project: makeProject(), workflow: makeWorkflow(), waves: [[envA], [envB]], resolveTarget: resolveTarget});

        expect(result.state).toBe(WaveState.Passed);
        expect(result.waves.map((wave) => wave.state)).toEqual([WaveState.Passed, WaveState.Passed]);
        expect(result.environmentRuns.map((run) => run.environmentId)).toEqual(['env-a', 'env-b']);

        const persisted = (await store.listRecords('environmentRun', EnvironmentRunSchema)).filter((run) => run.waveRunId === result.run.id);
        expect(persisted).toHaveLength(2);
    });

    it('blocks later waves when a wave fails and never runs their environments', async () => {
        const controller = makeController(store, new Map([['tgt-a', CycleState.Failed]]));
        const result = await controller.run({project: makeProject(), workflow: makeWorkflow(), waves: [[envA], [envB]], resolveTarget: resolveTarget});

        expect(result.state).toBe(WaveState.Failed);
        expect(result.waves.map((wave) => wave.state)).toEqual([WaveState.Failed, WaveState.Blocked]);
        expect(result.waves[1].environmentRuns).toHaveLength(0);
        // Wave 2's environment never executed.
        expect(result.environmentRuns.map((run) => run.environmentId)).toEqual(['env-a']);
    });

    it('passes a wave with deviations and continues', async () => {
        const controller = makeController(store, new Map([['tgt-a', CycleState.PassedWithDeviations]]));
        const result = await controller.run({project: makeProject(), workflow: makeWorkflow(), waves: [[envA], [envB]], resolveTarget: resolveTarget});

        expect(result.waves[0].state).toBe(WaveState.Passed);
        expect(result.state).toBe(WaveState.Passed);
        expect(result.environmentRuns).toHaveLength(2);
    });
});
