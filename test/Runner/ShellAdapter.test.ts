import {describe, expect, it} from 'vitest';
import {AdapterKind, type CheckAction, ShellAdapter} from '../../src/index';

const adapter = new ShellAdapter({allowlist: ['printf', 'false', 'sleep']});

const action = (params: unknown): CheckAction => {
    return {adapter: AdapterKind.Shell, params: params};
};

describe('ShellAdapter', () => {
    it('runs an allow-listed binary and captures stdout + exit code', async () => {
        const outcome = await adapter.execute(action({bin: 'printf', args: ['ok']}));
        expect(outcome.executed).toBe(true);
        expect(outcome.exitCode).toBe(0);
        expect(outcome.stdout).toBe('ok');
    });

    it('captures a non-zero exit code', async () => {
        const outcome = await adapter.execute(action({bin: 'false'}));
        expect(outcome.executed).toBe(true);
        expect(outcome.exitCode).not.toBe(0);
    });

    it('refuses a binary that is not allow-listed', async () => {
        const outcome = await adapter.execute(action({bin: 'rm', args: ['-rf', '/']}));
        expect(outcome.executed).toBe(false);
        expect(outcome.reason).toContain('not_allowlisted');
    });

    it('treats a timeout as not executable', async () => {
        const outcome = await adapter.execute(action({bin: 'sleep', args: ['5'], timeoutMs: 100}));
        expect(outcome.executed).toBe(false);
        expect(outcome.reason).toContain('timeout');
    });

    it('rejects invalid params', async () => {
        const outcome = await adapter.execute(action({notBin: true}));
        expect(outcome.executed).toBe(false);
        expect(outcome.reason).toBe('invalid_params');
    });

    it('is deterministic for the same input', async () => {
        const a = await adapter.execute(action({bin: 'printf', args: ['ok']}));
        const b = await adapter.execute(action({bin: 'printf', args: ['ok']}));
        expect(a).toStrictEqual(b);
    });
});