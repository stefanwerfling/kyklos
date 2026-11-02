/**
 * DryRunner runs a playbook from a store with every adapter simulated. It also
 * locks the behaviour that a nonEmpty success criterion passes in a dry run
 * (the default resolver produces non-empty output) — the gotcha that a bare
 * dry-run registry with empty stdout would otherwise fail.
 */
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {
    type Check,
    type Checklist,
    ChecklistSchema,
    CycleState,
    DryRunner,
    FileStore,
    type Playbook,
    PlaybookSchema,
    PlaybookScope,
    PlaybookStatus,
    PlaybookStepKind,
    type Procedure,
    ProcedureSchema,
    RandomIdGenerator,
    SystemClock
} from '../../src/index';
import {makeCheck, makeProject, makeTargetSystem} from '../fixtures';

const nonEmptyCheck: Check = {...makeCheck(), id: 'needs.output', preconditions: [], successCriterion: {kind: 'nonEmpty'}};
const checklist: Checklist = {id: 'dcl', version: '1.0.0', ruleVersion: '1.0.0', checks: [{...makeCheck(), id: 'c1', preconditions: []}, nonEmptyCheck]};
const procedure: Procedure = {id: 'dproc', version: '1.0.0', name: 'dproc', kind: 'procedure', checklistId: 'dcl', checklistVersion: '1.0.0'};
const playbook: Playbook = {
    id: 'dmain', version: '1.0.0', name: 'dmain', status: PlaybookStatus.Published, scope: PlaybookScope.Global,
    targetSystems: [], technologies: [], prerequisites: [], steps: [{kind: PlaybookStepKind.Procedure, id: 'dproc', version: '1.0.0'}], sealed: false
};

describe('DryRunner', () => {
    let root: string;
    let runner: DryRunner;

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'kyklos-dryrunner-'));
        const store = new FileStore(root);
        await store.putDefinition('checklist', ChecklistSchema, checklist);
        await store.putDefinition('procedure', ProcedureSchema, procedure);
        await store.putDefinition('playbook', PlaybookSchema, playbook);
        runner = new DryRunner({store: store, idGenerator: new RandomIdGenerator(), clock: new SystemClock()});
    });

    afterEach(async () => {
        await rm(root, {recursive: true, force: true});
    });

    it('resolves, compiles and runs a playbook green (incl. a nonEmpty criterion)', async () => {
        const result = await runner.run({project: makeProject(), target: makeTargetSystem(), root: {kind: PlaybookStepKind.Playbook, id: 'dmain', version: '1.0.0'}});

        expect(result.cycle).toBeDefined();
        expect(result.cycle?.cycle.state).toBe(CycleState.Passed);
        expect(result.plan.compiledChecks).toHaveLength(2);
    });
});
