import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {
    type AdapterOutcome,
    AdapterKind,
    AdapterRegistry,
    type Check,
    CheckRunner,
    CheckStatus,
    DryRunAdapter,
    FileStore,
    FixCycle,
    IncidentRepository
} from '../../src/index';
import {makeCheck, makeIncident} from '../fixtures';

interface FixState {
    fixed: boolean;
}

const check: Check = {...makeCheck(), action: {adapter: AdapterKind.Shell, params: {bin: 'x'}}, successCriterion: {kind: 'exitZero'}};

const runnerFor = (state: FixState): CheckRunner => {
    const resolver = (): AdapterOutcome => {
        return state.fixed ? {executed: true, exitCode: 0} : {executed: true, exitCode: 1};
    };
    return new CheckRunner(new AdapterRegistry().register(new DryRunAdapter(AdapterKind.Shell, resolver)));
};

describe('FixCycle', () => {
    it('reproduces the failure, applies the fix and confirms it is resolved', async () => {
        const state: FixState = {fixed: false};
        const report = await FixCycle.run({
            check: check,
            runner: runnerFor(state),
            originalStatus: CheckStatus.Failed,
            applyFix: async (): Promise<void> => {
                state.fixed = true;
            }
        });
        expect(report.reproduced).toBe(true);
        expect(report.reproducedStatus).toBe(CheckStatus.Failed);
        expect(report.postFixStatus).toBe(CheckStatus.Passed);
        expect(report.resolved).toBe(true);
        expect(report.residualRisk).toBe('none');
    });

    it('does not claim resolution when the fix does nothing', async () => {
        const state: FixState = {fixed: false};
        const report = await FixCycle.run({
            check: check,
            runner: runnerFor(state),
            originalStatus: CheckStatus.Failed,
            applyFix: async (): Promise<void> => {
                // no-op fix
            }
        });
        expect(report.resolved).toBe(false);
        expect(report.residualRisk).toContain('unresolved');
    });

    it('refuses to verify a fix that never reproduced', async () => {
        const state: FixState = {fixed: true};
        const report = await FixCycle.run({
            check: check,
            runner: runnerFor(state),
            originalStatus: CheckStatus.Failed,
            applyFix: async (): Promise<void> => {
                // nothing
            }
        });
        expect(report.reproduced).toBe(false);
        expect(report.resolved).toBe(false);
        expect(report.residualRisk).toContain('not_reproducible');
    });
});

describe('FixCycle with prior incidents', () => {
    let root: string;

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'kyklos-fix-'));
    });

    afterEach(async () => {
        await rm(root, {recursive: true, force: true});
    });

    it('surfaces similar prior incidents by signature', async () => {
        const repo = new IncidentRepository(new FileStore(root));
        await repo.save({...makeIncident(), id: 'inc-1', signature: 'backup:restore:failed'});

        const state: FixState = {fixed: false};
        const report = await FixCycle.run({
            check: check,
            runner: runnerFor(state),
            originalStatus: CheckStatus.Failed,
            applyFix: async (): Promise<void> => {
                state.fixed = true;
            },
            incidentRepository: repo,
            signature: 'backup:restore:failed'
        });
        expect(report.priorIncidents.map((inc) => inc.id)).toEqual(['inc-1']);
    });
});