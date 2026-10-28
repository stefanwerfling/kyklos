import {describe, expect, it} from 'vitest';
import {
    AdapterKind,
    AdapterRegistry,
    type AdapterOutcome,
    type Check,
    CheckRunner,
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

describe('ProcessRunner permission enforcement (trusted tier from the action)', () => {
    const alwaysPass = (): AdapterOutcome => {
        return {executed: true, exitCode: 0};
    };
    const runner = new CheckRunner(new AdapterRegistry().register(new DryRunAdapter(AdapterKind.Shell, alwaysPass)));
    const productionCheck: Check = {...makeCheck(), action: {adapter: AdapterKind.Shell, params: {bin: 'x'}, permissionTier: PermissionTier.Production}, successCriterion: {kind: 'exitZero'}};
    const testCheck: Check = {...makeCheck(), action: {adapter: AdapterKind.Shell, params: {bin: 'x'}, permissionTier: PermissionTier.TempTest}, successCriterion: {kind: 'exitZero'}};

    it('denies an action whose declared tier exceeds the ceiling, without executing it', async () => {
        const processRunner = new ProcessRunner(runner, new SystemClock(), new RandomIdGenerator(), new PermissionPolicy(PermissionTier.Read));
        const result = await processRunner.run(productionCheck);
        expect(result.status).toBe(CheckStatus.NotExecutable);
        expect(result.execution.stderr).toContain('permission_denied');
    });

    it('allows an action within the ceiling', async () => {
        const processRunner = new ProcessRunner(runner, new SystemClock(), new RandomIdGenerator(), new PermissionPolicy(PermissionTier.TempTest));
        const result = await processRunner.run(testCheck);
        expect(result.status).toBe(CheckStatus.Passed);
    });
});