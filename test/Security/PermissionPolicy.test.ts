import {describe, expect, it} from 'vitest';
import {
    AdapterKind,
    AdapterRegistry,
    type AdapterOutcome,
    type Check,
    CheckStatus,
    DryRunAdapter,
    PermissionPolicy,
    PermissionTier,
    ProcessRunner,
    RandomIdGenerator,
    SystemClock
} from '../../src/index';
import {makeCheck} from '../fixtures';

describe('PermissionPolicy', () => {
    it('allows tiers up to the ceiling and denies above it', () => {
        const policy = new PermissionPolicy(PermissionTier.TempTest);
        expect(policy.allows(PermissionTier.Read)).toBe(true);
        expect(policy.allows(PermissionTier.TempTest)).toBe(true);
        expect(policy.allows(PermissionTier.LocalWrite)).toBe(false);
        expect(policy.allows(PermissionTier.Production)).toBe(false);
    });
});

describe('ProcessRunner permission enforcement', () => {
    const alwaysPass = (): AdapterOutcome => {
        return {executed: true, exitCode: 0};
    };
    const adapter = new DryRunAdapter(AdapterKind.Shell, alwaysPass);
    const check: Check = {...makeCheck(), action: {adapter: AdapterKind.Shell, params: {bin: 'x'}}, successCriterion: {kind: 'exitZero'}};

    it('denies an action above the ceiling without executing it', async () => {
        const runner = new ProcessRunner(adapter, new SystemClock(), new RandomIdGenerator(), new PermissionPolicy(PermissionTier.Read));
        const result = await runner.run(check, PermissionTier.Production);
        expect(result.status).toBe(CheckStatus.NotExecutable);
        expect(result.execution.stderr).toContain('permission_denied');
    });

    it('allows an action within the ceiling', async () => {
        const runner = new ProcessRunner(adapter, new SystemClock(), new RandomIdGenerator(), new PermissionPolicy(PermissionTier.TempTest));
        const result = await runner.run(check, PermissionTier.TempTest);
        expect(result.status).toBe(CheckStatus.Passed);
    });
});