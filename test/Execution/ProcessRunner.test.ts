import {describe, expect, it} from 'vitest';
import {
    AdapterKind,
    type Check,
    CheckStatus,
    PermissionTier,
    ProcessRunner,
    RandomIdGenerator,
    ShellAdapter,
    SystemClock
} from '../../src/index';
import {makeCheck} from '../fixtures';

const runner = new ProcessRunner(new ShellAdapter({allowlist: ['printf', 'false']}), new SystemClock(), new RandomIdGenerator());

const shellCheck = (bin: string, args: string[]): Check => {
    return {...makeCheck(), id: `cli.${bin}`, action: {adapter: AdapterKind.Shell, params: {bin: bin, args: args}}, successCriterion: {kind: 'exitZero'}};
};

describe('ProcessRunner records real executions', () => {
    it('runs a real command and records a passing execution', async () => {
        const result = await runner.run(shellCheck('printf', ['ok']), PermissionTier.TempTest);
        expect(result.status).toBe(CheckStatus.Passed);
        expect(result.execution.exitCode).toBe(0);
        expect(result.execution.command).toBe('printf ok');
        expect(result.execution.permissionTier).toBe(PermissionTier.TempTest);
        expect(result.execution.stdoutSha256).toMatch(/^[a-f0-9]{64}$/u);
        expect(result.execution.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('records a real failing exit code', async () => {
        const result = await runner.run(shellCheck('false', []), PermissionTier.TempTest);
        expect(result.status).toBe(CheckStatus.Failed);
        expect(result.execution.exitCode).not.toBe(0);
    });

    it('records a not-executable run for a non-allow-listed binary', async () => {
        const result = await runner.run(shellCheck('rm', ['-rf', '/']), PermissionTier.TempTest);
        expect(result.status).toBe(CheckStatus.NotExecutable);
        expect(result.execution.status).toBe(CheckStatus.NotExecutable);
    });
});