import {describe, expect, it} from 'vitest';
import {AdapterKind, CheckStatus, PermissionTier, ToolExecutionRecorder} from '../../src/index';

const base = {
    id: 'exec-1',
    adapter: AdapterKind.Shell,
    permissionTier: PermissionTier.TempTest,
    command: 'node -e ...',
    status: CheckStatus.Passed,
    startedAt: '2026-10-28T00:00:00.000Z',
    endedAt: '2026-10-28T00:00:01.000Z',
    durationMs: 1000,
    stdout: 'ok',
    stderr: ''
};

describe('ToolExecutionRecorder integrity', () => {
    it('marks the record complete when output was not truncated', () => {
        const execution = ToolExecutionRecorder.record({...base});
        expect(execution.outputComplete).toBe(true);
        expect(execution.stdoutSha256).toMatch(/^[a-f0-9]{64}$/u);
    });

    it('marks the record incomplete when output was truncated (hash is not a full proof)', () => {
        const execution = ToolExecutionRecorder.record({...base, outputTruncated: true});
        expect(execution.outputComplete).toBe(false);
    });

    it('truncates the display output while hashing the full input', () => {
        const big = 'y'.repeat(5000);
        const execution = ToolExecutionRecorder.record({...base, stdout: big});
        expect(execution.stdout.length).toBeLessThan(big.length);
        expect(execution.stdout).toContain('truncated');
    });
});