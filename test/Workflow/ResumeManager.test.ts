import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {
    type CycleRunResult,
    CycleState,
    type ExecutionPlan,
    FileStore,
    type PhaseExecutor,
    PlaybookStepKind,
    RandomIdGenerator,
    ResumeManager,
    SystemClock,
    type Workflow,
    WorkflowEngine,
    WorkflowStatus
} from '../../src/index';
import {makeProject, makeTargetSystem} from '../fixtures';

const workflow: Workflow = {
    id: 'wf', version: '1.0.0', name: 'wf', status: WorkflowStatus.Published,
    phases: [
        {id: 'prepare', name: 'prepare', dependsOn: [], optional: false, root: {kind: PlaybookStepKind.Procedure, id: 'prepare', version: '1.0.0'}, targetSystemId: undefined, rollback: undefined, runOn: undefined},
        {id: 'deploy', name: 'deploy', dependsOn: ['prepare'], optional: false, root: {kind: PlaybookStepKind.Procedure, id: 'deploy', version: '1.0.0'}, targetSystemId: undefined, rollback: undefined, runOn: undefined}
    ]
};

describe('ResumeManager', () => {
    let root: string;
    let store: FileStore;
    let engine: WorkflowEngine;
    let resumeManager: ResumeManager;
    const calls: string[] = [];
    const fail = {deploy: true};

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'kyklos-wf-'));
        store = new FileStore(root);
        calls.length = 0;
        fail.deploy = true;
        const executor: PhaseExecutor = {
            run: async (input): Promise<{plan: ExecutionPlan; cycle?: CycleRunResult;}> => {
                calls.push(input.root.id);
                const state = input.root.id === 'deploy' && fail.deploy ? CycleState.Failed : CycleState.Passed;
                return {
                    plan: {id: `plan-${input.root.id}-${calls.length}`} as unknown as ExecutionPlan,
                    cycle: {cycle: {id: `cyc-${input.root.id}-${calls.length}`, state: state}} as unknown as CycleRunResult
                };
            }
        };
        engine = new WorkflowEngine({executor: executor, idGenerator: new RandomIdGenerator(), clock: new SystemClock(), store: store});
        resumeManager = new ResumeManager(engine, store);
    });

    afterEach(async () => {
        await rm(root, {recursive: true, force: true});
    });

    it('resumes a failed run, retrying only the unfinished phase', async () => {
        const input = {project: makeProject(), workflow: workflow, target: makeTargetSystem()};

        const first = await engine.run(input);
        expect(first.state).toBe(CycleState.Failed);
        expect(calls).toEqual(['prepare', 'deploy']);

        fail.deploy = false;
        calls.length = 0;

        const resumed = await resumeManager.resume(first.run.id, input);
        expect(resumed.state).toBe(CycleState.Passed);
        expect(calls).toContain('deploy');
        expect(calls).not.toContain('prepare');
    });
});