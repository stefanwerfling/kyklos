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
    ExecutionPlanSchema,
    FileStore,
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
    SystemClock
} from '../../src/index';
import {makeCheck, makeProject, makeTargetSystem} from '../fixtures';

const cla: Checklist = {id: 'cla', version: '1.0.0', ruleVersion: '1.0.0', checks: [{...makeCheck(), id: 'ca'}]};
const pa: Procedure = {id: 'pa', version: '1.0.0', name: 'pa', kind: 'procedure', checklistId: 'cla', checklistVersion: '1.0.0'};
const main: Playbook = {
    id: 'main', version: '1.0.0', name: 'main', status: PlaybookStatus.Published, scope: PlaybookScope.Global,
    targetSystems: [], technologies: [], prerequisites: [], steps: [{kind: PlaybookStepKind.Procedure, id: 'pa', version: '1.0.0'}], sealed: false
};

describe('PlanExecutor integration', () => {
    let root: string;
    let store: FileStore;
    let executor: PlanExecutor;

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'kyklos-plan-'));
        store = new FileStore(root);
        await store.putDefinition('checklist', ChecklistSchema, cla);
        await store.putDefinition('procedure', ProcedureSchema, pa);
        await store.putDefinition('playbook', PlaybookSchema, main);
        const engine = new CycleEngine({runner: new CheckRunner(ReleaseExample.dryRunRegistry()), idGenerator: new RandomIdGenerator(), clock: new SystemClock(), store: store});
        executor = new PlanExecutor({engine: engine, source: new StoreDefinitionSource(store), idGenerator: new RandomIdGenerator(), clock: new SystemClock(), store: store});
    });

    afterEach(async () => {
        await rm(root, {recursive: true, force: true});
    });

    it('resolves, compiles and runs a playbook, persisting a linked ExecutionPlan', async () => {
        const result = await executor.run({project: makeProject(), target: makeTargetSystem(), root: {kind: PlaybookStepKind.Playbook, id: 'main', version: '1.0.0'}});

        expect(result.cycle?.cycle.state).toBe(CycleState.Passed);
        expect(result.plan.compiledChecks.map((c) => c.id)).toEqual(['ca']);
        expect(result.plan.checkProvenance[0].sourceKind).toBe(PlaybookStepKind.Procedure);
        expect(result.plan.checkProvenance[0].sourceId).toBe('pa');
        expect(result.plan.cycleId).toBe(result.cycle?.cycle.id);

        const persisted = await store.getRecord('executionPlan', result.plan.id, ExecutionPlanSchema);
        expect(persisted).toStrictEqual(result.plan);
    });

    it('runs a bare procedure root unchanged (regression)', async () => {
        const result = await executor.run({project: makeProject(), target: makeTargetSystem(), root: {kind: PlaybookStepKind.Procedure, id: 'pa', version: '1.0.0'}});
        expect(result.cycle?.cycle.state).toBe(CycleState.Passed);
        expect(result.plan.compiledChecks.map((c) => c.id)).toEqual(['ca']);
    });

    it('does not execute an unresolvable root but persists the plan with diagnostics', async () => {
        const result = await executor.run({project: makeProject(), target: makeTargetSystem(), root: {kind: PlaybookStepKind.Playbook, id: 'nope', version: '1.0.0'}});
        expect(result.cycle).toBeUndefined();
        expect(result.plan.diagnostics.map((d) => d.kind)).toContain('missing_prerequisite');
        const persisted = await store.getRecord('executionPlan', result.plan.id, ExecutionPlanSchema);
        expect(persisted.cycleId).toBeUndefined();
    });
});