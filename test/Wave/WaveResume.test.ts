/**
 * Resume: WaveResumeManager rebuilds a rollout from its stored EnvironmentRuns
 * and continues it through WaveController — environments that already passed are
 * not re-run; a failed environment (and the waves its failure blocked) is.
 */
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {
    CycleState,
    type Environment,
    EnvironmentKind,
    FileStore,
    RandomIdGenerator,
    type TargetSystem,
    WaveController,
    WaveResumeManager,
    WaveState,
    WorkflowEngine
} from '../../src/index';
import {FixedClock, StubPhaseExecutor} from '../doubles';
import {makeProject, makeWorkflow} from '../fixtures';

const envA: Environment = {id: 'env-a', name: 'test-a', kind: EnvironmentKind.Test, targetSystemId: 'tgt-a', labels: undefined, address: undefined};
const envB: Environment = {id: 'env-b', name: 'prod-b', kind: EnvironmentKind.Production, targetSystemId: 'tgt-b', labels: undefined, address: undefined};
const resolveTarget = (environment: Environment): TargetSystem => {
    return {id: environment.targetSystemId, os: 'debian', osVersion: undefined, technologies: []};
};
const input = {project: makeProject(), workflow: makeWorkflow(), waves: [[envA], [envB]], resolveTarget: resolveTarget};

const build = (store: FileStore, stateByTarget: Map<string, CycleState>): {controller: WaveController; executor: StubPhaseExecutor;} => {
    const executor = new StubPhaseExecutor(stateByTarget);
    const engine = new WorkflowEngine({executor: executor, idGenerator: new RandomIdGenerator(), clock: new FixedClock()});
    const controller = new WaveController({engine: engine, idGenerator: new RandomIdGenerator(), clock: new FixedClock(), store: store});
    return {controller: controller, executor: executor};
};

describe('WaveResumeManager', () => {
    let dir: string;
    let store: FileStore;

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), 'kyklos-wresume-'));
        store = new FileStore(dir);
    });

    afterEach(async () => {
        await rm(dir, {recursive: true, force: true});
    });

    it('re-runs a failed wave and continues once it passes', async () => {
        // First attempt: wave 1 fails, wave 2 is blocked (never runs).
        const first = build(store, new Map([['tgt-a', CycleState.Failed]]));
        const firstResult = await first.controller.run(input);
        expect(firstResult.state).toBe(WaveState.Failed);
        expect(firstResult.environmentRuns.map((environmentRun) => environmentRun.environmentId)).toEqual(['env-a']);

        // Fix: tgt-a now passes. Resume with the same rollout id.
        const second = build(store, new Map());
        const resumed = await new WaveResumeManager(second.controller, store).resume(firstResult.run.id, input);

        expect(resumed.state).toBe(WaveState.Passed);
        expect(resumed.environmentRuns.map((environmentRun) => environmentRun.environmentId)).toEqual(['env-a', 'env-b']);
        // Both environments ran in the resume (env-a retried, env-b now unblocked).
        expect(second.executor.calls).toBeGreaterThan(0);
    });

    it('reuses already-passed environments on resume without re-running them', async () => {
        const first = build(store, new Map());
        const firstResult = await first.controller.run(input);
        expect(firstResult.state).toBe(WaveState.Passed);

        const second = build(store, new Map());
        const resumed = await new WaveResumeManager(second.controller, store).resume(firstResult.run.id, input);

        expect(resumed.state).toBe(WaveState.Passed);
        // Everything already passed, so the resume runs no workflow at all.
        expect(second.executor.calls).toBe(0);
        // The reused runs are the originals.
        expect(resumed.environmentRuns.map((environmentRun) => environmentRun.id).sort()).toEqual(firstResult.environmentRuns.map((environmentRun) => environmentRun.id).sort());
    });
});
