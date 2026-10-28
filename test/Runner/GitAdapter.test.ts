import {describe, expect, it} from 'vitest';
import {AdapterKind, type CheckAction, GitAdapter, PermissionTier} from '../../src/index';

const adapter = new GitAdapter();

const git = (args: string[]): CheckAction => {
    return {adapter: AdapterKind.Git, params: {args: args}};
};

describe('GitAdapter (read-only)', () => {
    it('declares the read permission tier', () => {
        expect(adapter.permissionTier).toBe(PermissionTier.Read);
    });

    it('runs a real read subcommand and captures output', async () => {
        const outcome = await adapter.execute(git(['rev-parse', '--abbrev-ref', 'HEAD']));
        expect(outcome.executed).toBe(true);
        expect(outcome.exitCode).toBe(0);
        expect((outcome.stdout ?? '').trim().length).toBeGreaterThan(0);
    });

    it('refuses a write subcommand', async () => {
        const outcome = await adapter.execute(git(['commit', '-m', 'nope']));
        expect(outcome.executed).toBe(false);
        expect(outcome.reason).toContain('not_read_subcommand');
    });

    it('refuses an empty argument list', async () => {
        const outcome = await adapter.execute(git([]));
        expect(outcome.executed).toBe(false);
        expect(outcome.reason).toContain('not_read_subcommand');
    });

    it('rejects invalid params', async () => {
        const outcome = await adapter.execute({adapter: AdapterKind.Git, params: {wrong: true}});
        expect(outcome.executed).toBe(false);
        expect(outcome.reason).toBe('invalid_params');
    });
});