import {describe, expect, it} from 'vitest';
import {Capability, PermissionTier, type Role, RoleRegistry} from '../../src/index';
import {makeRole} from '../fixtures';

const operator: Role = {id: 'operator', version: '1.0.0', name: 'Operator', capabilities: [Capability.SubmitFeedback], maxTier: PermissionTier.Shared};

describe('RoleRegistry', () => {
    it('resolves a registered role by id', () => {
        const registry = new RoleRegistry([makeRole()]);
        expect(registry.resolve('release-approver')?.name).toBe('Release approver');
    });

    it('returns undefined for an unknown role id (fail-closed)', () => {
        const registry = new RoleRegistry([makeRole()]);
        expect(registry.resolve('ghost')).toBeUndefined();
    });

    it('lists all registered roles ordered by id', () => {
        const registry = new RoleRegistry([makeRole(), operator]);
        expect(registry.all().map((role) => role.id)).toEqual(['operator', 'release-approver']);
    });
});
