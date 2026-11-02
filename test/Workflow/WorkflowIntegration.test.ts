/**
 * Integration: a workflow whose phases are executed by the real PlanExecutor
 * (W1) over the unchanged CycleEngine. Proves the whole chain — workflow -> phase
 * -> playbook/procedure resolution+compilation -> cycle -> PhaseRun — end to end.
 */
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {
    type Checklist,
    ChecklistSchema,
    CheckRunner,
    CycleEngine,
    CycleState,
    FileStore,
    PhaseRunSchema,
    type Playbook,
    PlaybookSchema,
    PlaybookScope,
    PlaybookStatus,
    PlaybookStepKind,
    PlanExecutor,
    type Procedure,
    ProcedureSchema,
    RandomIdGenerator,
    ReleaseExample,
    StoreDefinitionSource,
    SystemClock,
    type Workflow,
    WorkflowEngine,
    WorkflowRunSchema,
    WorkflowStatus
} from '../../src/index';
import {makeCheck, makeProject, makeTargetSystem} from '../fixtures';

const cla: Checklist = {id: 'cla', version: '1.0.0', ruleVersion: '1.0.0', checks: [{...makeCheck(), id: 'ca'}]};
const pa: Procedure = {id: 'pa', version: '1.0.0', name: 'pa', kind: 'procedure', checklistId: 'cla', checklistVersion: '1.0.0'};
const main: Playbook = {
    id: 'main', version: '1.0.0', name: 'main', status: PlaybookStatus.Published, scope: PlaybookScope.Global,
    targetSystems: [], technologies: [], prerequisites: [], steps: [{kind: PlaybookStepKind.Procedure, id: 'pa', version: '1.0.0'}], sealed: false
};

const workflow: Workflow = {
    id: 'wf', version: '1.0.0', name: 'wf', status: WorkflowStatus.Published,
    phases: [
        {id: 'phase1', name: 'phase1', dependsOn: [], optional: false, root: {kind: PlaybookStepKind.Playbook, id: 'main', version: '1.0.0'}, targetSystemId: undefined, rollback: undefined, runOn: undefined},
        {id: 'phase2', name: 'phase2', dependsOn: ['phase1'], optional: false, root: {kind: PlaybookStepKind.Procedure, id: 'pa', version: '1.0.0'}, targetSystemId: undefined, rollback: undefined, runOn: undefined}
    ]
};

describe('Workflow integration with the real PlanExecutor', () => {
    let root: string;
    let store: FileStore;
    let engine: WorkflowEngine;

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'kyklos-wfint-'));
        store = new FileStore(root);
        await store.putDefinition('checklist', ChecklistSchema, cla);
        await store.putDefinition('procedure', ProcedureSchema, pa);
        await store.putDefinition('playbook', PlaybookSchema, main);
        const cycleEngine = new CycleEngine({runner: new CheckRunner(ReleaseExample.dryRunRegistry()), idGenerator: new RandomIdGenerator(), clock: new SystemClock(), store: store});
        const planExecutor = new PlanExecutor({engine: cycleEngine, source: new StoreDefinitionSource(store), idGenerator: new RandomIdGenerator(), clock: new SystemClock(), store: store});
        engine = new WorkflowEngine({executor: planExecutor, idGenerator: new RandomIdGenerator(), clock: new SystemClock(), store: store});
    });

    afterEach(async () => {
        await rm(root, {recursive: true, force: true});
    });

    it('runs both phases through PlanExecutor + CycleEngine and persists the run', async () => {
        const result = await engine.run({project: makeProject(), workflow: workflow, target: makeTargetSystem()});

        expect(result.state).toBe(CycleState.Passed);
        expect(result.phaseRuns).toHaveLength(2);
        expect(result.phaseRuns.every((r) => r.cycleId !== undefined && r.planId !== undefined)).toBe(true);

        const persistedRun = await store.getRecord('workflowRun', result.run.id, WorkflowRunSchema);
        expect(persistedRun.workflowId).toBe('wf');
        const persistedPhases = (await store.listRecords('phaseRun', PhaseRunSchema)).filter((r) => r.workflowRunId === result.run.id);
        expect(persistedPhases).toHaveLength(2);
    });
});