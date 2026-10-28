import {describe, expect, it} from 'vitest';
import {
    type AdapterOutcome,
    AdapterKind,
    AdapterRegistry,
    type Check,
    CheckRunner,
    CheckStatus,
    DryRunAdapter,
    FixCycle
} from '../../src/index';
import {makeCheck} from '../fixtures';

const failingRunner = (): CheckRunner => {
    const resolver = (): AdapterOutcome => {
        return {executed: true, exitCode: 1};
    };
    return new CheckRunner(new AdapterRegistry().register(new DryRunAdapter(AdapterKind.Shell, resolver)));
};

const check: Check = {...makeCheck(), action: {adapter: AdapterKind.Shell, params: {bin: 'x'}}, successCriterion: {kind: 'exitZero'}};

describe('FixCycle error handling', () => {
    it('does not throw and never claims resolution when the fix throws', async () => {
        const report = await FixCycle.run({
            check: check,
            runner: failingRunner(),
            originalStatus: CheckStatus.Failed,
            applyFix: async (): Promise<void> => {
                throw new Error('patch failed to apply');
            }
        });
        expect(report.reproduced).toBe(true);
        expect(report.resolved).toBe(false);
        expect(report.residualRisk).toContain('fix_error');
        expect(report.error).toContain('patch failed to apply');
        // Original failure evidence is preserved, not overwritten.
        expect(report.reproducedStatus).toBe(CheckStatus.Failed);
        expect(report.postFixStatus).toBe(CheckStatus.Failed);
    });
});