import {describe, expect, it} from 'vitest';
import {AdapterKind, type CheckAction, ShellAdapter} from '../../src/index';

const adapter = new ShellAdapter({allowlist: ['node', 'does-not-exist-xyz']});

const action = (params: unknown): CheckAction => {
    return {adapter: AdapterKind.Shell, params: params};
};

describe('ShellAdapter resource bounds', () => {
    it('bounds large stdout and flags it as truncated', async () => {
        const outcome = await adapter.execute(action({bin: 'node', args: ['-e', 'process.stdout.write("x".repeat(2_000_000))']}));
        expect(outcome.executed).toBe(true);
        expect(outcome.outputTruncated).toBe(true);
        expect((outcome.stdout ?? '').length).toBeLessThanOrEqual(1000000);
    });

    it('does not flag normal output as truncated', async () => {
        const outcome = await adapter.execute(action({bin: 'node', args: ['-e', 'process.stdout.write("small")']}));
        expect(outcome.outputTruncated).toBe(false);
        expect(outcome.stdout).toBe('small');
    });

    it('reports a spawn error as not executable (never passed)', async () => {
        const outcome = await adapter.execute(action({bin: 'does-not-exist-xyz', args: []}));
        expect(outcome.executed).toBe(false);
        expect(outcome.reason).toContain('spawn_error');
    });
});