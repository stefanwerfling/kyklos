/**
 * RealRunner integration: runs a playbook from a store with real adapters and
 * ${VAR} resolution. Uses `node -e` (always available, deterministic) as the
 * allow-listed command so the test needs no external tooling, and proves the
 * env value is substituted into the real invocation.
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
    FileStore,
    type Playbook,
    PlaybookSchema,
    PlaybookScope,
    PlaybookStatus,
    PlaybookStepKind,
    type Procedure,
    ProcedureSchema,
    RandomIdGenerator,
    RealRunner,
    SystemClock
} from '../../src/index';
import {makeProject, makeTargetSystem} from '../fixtures';

const check: Check = {
    id: 'node.exit', version: '1.0.0', group: 'build', description: 'run a resolved node snippet',
    criticality: 'critical', preconditions: [],
    action: {adapter: 'shell', params: {bin: 'node', args: ['-e', '${SNIPPET}']}},
    successCriterion: {kind: 'exitZero'}, expectedEvidence: ['stdout'], onFailure: 'block'
};
const checklist: Checklist = {id: 'rcl', version: '1.0.0', ruleVersion: '1.0.0', checks: [check]};
const procedure: Procedure = {id: 'rproc', version: '1.0.0', name: 'rproc', kind: 'procedure', checklistId: 'rcl', checklistVersion: '1.0.0'};
const playbook: Playbook = {
    id: 'rmain', version: '1.0.0', name: 'rmain', status: PlaybookStatus.Published, scope: PlaybookScope.Global,
    targetSystems: [], technologies: [], prerequisites: [], steps: [{kind: PlaybookStepKind.Procedure, id: 'rproc', version: '1.0.0'}], sealed: false
};
const root = {kind: PlaybookStepKind.Playbook, id: 'rmain', version: '1.0.0'};

describe('RealRunner', () => {
    let dir: string;
    let store: FileStore;

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), 'kyklos-realrun-'));
        store = new FileStore(dir);
        await store.putDefinition('checklist', ChecklistSchema, checklist);
        await store.putDefinition('procedure', ProcedureSchema, procedure);
        await store.putDefinition('playbook', PlaybookSchema, playbook);
    });

    afterEach(async () => {
        await rm(dir, {recursive: true, force: true});
    });

    it('resolves ${VAR} and runs the real allow-listed command green', async () => {
        const runner = new RealRunner({store: store, idGenerator: new RandomIdGenerator(), clock: new SystemClock(), env: {SNIPPET: 'process.exit(0)'}, allowlist: ['node']});
        const result = await runner.run({project: makeProject(), target: makeTargetSystem(), root: root});

        expect(result.cycle?.cycle.state).toBe(CycleState.Passed);
    });

    it('blocks when the command is not on the allow-list (fail-closed)', async () => {
        const runner = new RealRunner({store: store, idGenerator: new RandomIdGenerator(), clock: new SystemClock(), env: {SNIPPET: 'process.exit(0)'}, allowlist: []});
        const result = await runner.run({project: makeProject(), target: makeTargetSystem(), root: root});

        expect(result.cycle?.cycle.state).not.toBe(CycleState.Passed);
    });
});
