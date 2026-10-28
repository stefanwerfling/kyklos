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
    CycleEngine,
    CycleSchema,
    CycleState,
    FileStore,
    ManualAdapter,
    ReleaseGate,
    ReleaseOutcome,
    ShellAdapter
} from '../../src/index';
import {makeCheck, makeProcedure, makeProject} from '../fixtures';
import {FixedClock, SequentialIdGenerator} from '../doubles';

const registry = new AdapterRegistry()
    .register(new ManualAdapter())
    .register(new ShellAdapter({allowlist: ['printf', 'false']}));
const runner = new CheckRunner(registry);

const check = (id: string, criticality: Check['criticality'], action: Check['action'], kind: string): Check => {
    return {...makeCheck(), id: id, criticality: criticality, action: action, successCriterion: {kind: kind}};
};

const checklistOf = (checks: Check[]): Checklist => {
    return {id: 'release.default', version: '1.0.0', ruleVersion: '1.0.0', checks: checks};
};

const newEngine = (store?: FileStore): CycleEngine => {
    return new CycleEngine({runner: runner, idGenerator: new SequentialIdGenerator(), clock: new FixedClock(), store: store});
};

const printfOk: Check['action'] = {adapter: AdapterKind.Shell, params: {bin: 'printf', args: ['ok']}};
const shellFalse: Check['action'] = {adapter: AdapterKind.Shell, params: {bin: 'false'}};
const manualUnanswered: Check['action'] = {adapter: AdapterKind.Manual};

describe('CycleEngine', () => {
    let root: string;

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'kyklos-cycle-'));
    });

    afterEach(async () => {
        await rm(root, {recursive: true, force: true});
    });

    it('produces passed_with_deviations for a non-critical failure', async () => {
        const checklist = checklistOf([
            check('c1', 'critical', printfOk, 'exitZero'),
            check('c2', 'major', shellFalse, 'exitZero')
        ]);
        const result = await newEngine().run({project: makeProject(), procedure: makeProcedure(), checklist: checklist});
        expect(result.cycle.state).toBe(CycleState.PassedWithDeviations);
        expect(result.observations).toHaveLength(2);
        expect(result.deviations).toHaveLength(1);
    });

    it('forces manual_release_required for an unanswered critical manual check', async () => {
        const checklist = checklistOf([
            check('c1', 'critical', printfOk, 'exitZero'),
            check('c2', 'critical', manualUnanswered, 'manualConfirm')
        ]);
        const result = await newEngine().run({project: makeProject(), procedure: makeProcedure(), checklist: checklist});
        expect(result.cycle.state).toBe(CycleState.ManualReleaseRequired);
    });

    it('persists the cycle and reads it back identically', async () => {
        const store = new FileStore(root);
        const checklist = checklistOf([check('c1', 'critical', printfOk, 'exitZero')]);
        const result = await newEngine(store).run({project: makeProject(), procedure: makeProcedure(), checklist: checklist});
        const loaded = await store.getRecord('cycle', result.cycle.id, CycleSchema);
        expect(loaded).toStrictEqual(result.cycle);
        expect(loaded.state).toBe(CycleState.Passed);
    });

    it('is deterministic with injected clock and id generator', async () => {
        const checklist = checklistOf([check('c1', 'critical', printfOk, 'exitZero')]);
        const a = await newEngine().run({project: makeProject(), procedure: makeProcedure(), checklist: checklist});
        const b = await newEngine().run({project: makeProject(), procedure: makeProcedure(), checklist: checklist});
        expect(a.cycle).toStrictEqual(b.cycle);
    });

    it('end to end: a manual-gated cycle is rejected, then approved via override', async () => {
        const checklist = checklistOf([check('c1', 'critical', manualUnanswered, 'manualConfirm')]);
        const result = await newEngine().run({project: makeProject(), procedure: makeProcedure(), checklist: checklist});
        expect(result.cycle.state).toBe(CycleState.ManualReleaseRequired);

        const gateInput = {cycle: result.cycle, ruleVersion: '1.0.0', decidedBy: 'gate', idGenerator: new SequentialIdGenerator(), clock: new FixedClock()};
        expect(ReleaseGate.decide(gateInput).outcome).toBe(ReleaseOutcome.Reject);
        expect(ReleaseGate.decide({...gateInput, override: {decidedBy: 'alice', justification: 'approved'}}).outcome).toBe(ReleaseOutcome.Approve);
    });
});