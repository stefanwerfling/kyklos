import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {
    type AdapterOutcome,
    type CheckAction,
    CheckRunner,
    CycleEngine,
    CycleSchema,
    CycleState,
    FileStore,
    ReleaseExample,
    ReleaseGate,
    ReleaseOutcome
} from '../../src/index';
import {FixedClock, SequentialIdGenerator} from '../doubles';

const engineWith = (resolver?: (action: CheckAction) => AdapterOutcome, store?: FileStore): CycleEngine => {
    const runner = new CheckRunner(ReleaseExample.dryRunRegistry(resolver));
    return new CycleEngine({runner: runner, idGenerator: new SequentialIdGenerator(), clock: new FixedClock(), store: store});
};

const input = () => {
    return {project: ReleaseExample.project(), procedure: ReleaseExample.procedure(), checklist: ReleaseExample.checklist()};
};

describe('ReleaseExample end-to-end dry run', () => {
    let root: string;

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'kyklos-example-'));
    });

    afterEach(async () => {
        await rm(root, {recursive: true, force: true});
    });

    it('runs the whole A–E checklist to a passed, auditable, persisted record', async () => {
        const store = new FileStore(root);
        const result = await engineWith(undefined, store).run(input());

        expect(result.cycle.state).toBe(CycleState.Passed);
        expect(result.observations).toHaveLength(ReleaseExample.checklist().checks.length);
        expect(result.deviations).toHaveLength(0);

        const loaded = await store.getRecord('cycle', result.cycle.id, CycleSchema);
        expect(loaded).toStrictEqual(result.cycle);

        const decision = ReleaseGate.decide({cycle: result.cycle, ruleVersion: '1.0.0', decidedBy: 'gate', idGenerator: new SequentialIdGenerator(), clock: new FixedClock()});
        expect(decision.outcome).toBe(ReleaseOutcome.Approve);
    });

    it('reproduces the §5.3 flow: a failing run blocks, then an override approves', async () => {
        const failAll = (): AdapterOutcome => {
            return {executed: true, exitCode: 1, httpStatus: 500, confirmed: false};
        };
        const result = await engineWith(failAll).run(input());

        expect(result.cycle.state).toBe(CycleState.Failed);
        expect(result.deviations.length).toBeGreaterThan(0);

        const base = {cycle: result.cycle, ruleVersion: '1.0.0', decidedBy: 'gate', idGenerator: new SequentialIdGenerator(), clock: new FixedClock()};
        expect(ReleaseGate.decide(base).outcome).toBe(ReleaseOutcome.Reject);
        expect(ReleaseGate.decide({...base, override: {decidedBy: 'alice', justification: 'approved maintenance window'}}).outcome).toBe(ReleaseOutcome.Approve);
    });

    it('yields passed_with_deviations when only a non-critical check fails', async () => {
        const failMetrics = (action: CheckAction): AdapterOutcome => {
            const params = action.params as {url?: string;} | undefined;
            if (params?.url !== undefined && params.url.includes('metrics')) {
                return {executed: true, httpStatus: 500};
            }

            return {executed: true, exitCode: 0, httpStatus: 200, confirmed: true};
        };
        const result = await engineWith(failMetrics).run(input());
        expect(result.cycle.state).toBe(CycleState.PassedWithDeviations);
    });
});