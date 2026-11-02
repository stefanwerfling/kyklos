import {describe, expect, it} from 'vitest';
import {
    type Actor,
    AuthorizationService,
    Capability,
    EnvironmentKind,
    PermissionTier,
    type Role,
    RoleRegistry
} from '../../src/index';
import {makeRole, makeTask} from '../fixtures';

const operator: Role = {id: 'operator', version: '1.0.0', name: 'Operator', capabilities: [Capability.SubmitFeedback], maxTier: PermissionTier.Shared};
const prodApprover: Role = {id: 'prod-approver', version: '1.0.0', name: 'Prod approver', capabilities: [Capability.ApproveRelease, Capability.ApproveProductionRelease], maxTier: PermissionTier.Production};

const auth = (): AuthorizationService => {
    return new AuthorizationService(new RoleRegistry([makeRole(), operator, prodApprover]));
};

const actorWith = (...roles: string[]): Actor => {
    return {id: 'actor-x', name: 'X', roles: roles};
};

describe('AuthorizationService', () => {
    it('unions capabilities across an actor\'s roles', () => {
        const caps = auth().capabilities(actorWith('operator', 'release-approver'));
        expect(caps.has(Capability.SubmitFeedback)).toBe(true);
        expect(caps.has(Capability.ApproveRelease)).toBe(true);
    });

    it('denies a capability from an unknown role (fail-closed)', () => {
        expect(auth().can(actorWith('ghost'), Capability.ApproveRelease)).toBe(false);
    });

    it('denies every capability for an actor with no roles', () => {
        expect(auth().can(actorWith(), Capability.ApproveRelease)).toBe(false);
    });

    it('reports the highest tier across roles, Read when none grant more', () => {
        expect(auth().maxTier(actorWith('operator'))).toBe(PermissionTier.Shared);
        expect(auth().maxTier(actorWith('operator', 'prod-approver'))).toBe(PermissionTier.Production);
        expect(auth().maxTier(actorWith('ghost'))).toBe(PermissionTier.Read);
    });

    it('authorize throws for a missing capability', () => {
        expect(() => auth().authorize(actorWith('operator'), Capability.ApproveRelease)).toThrow();
    });

    it('authorizeApproval requires ApproveRelease', () => {
        expect(() => auth().authorizeApproval(actorWith('operator'), makeTask())).toThrow();
    });

    it('authorizeApproval requires ApproveProductionRelease for a production release', () => {
        // release-approver has ApproveRelease but not the production capability.
        expect(() => auth().authorizeApproval(actorWith('release-approver'), makeTask(), {environmentKind: EnvironmentKind.Production})).toThrow();
        expect(() => auth().authorizeApproval(actorWith('prod-approver'), makeTask(), {environmentKind: EnvironmentKind.Production})).not.toThrow();
    });

    it('authorizeApproval refuses the actor who performed the work (separation of duties)', () => {
        const actor = actorWith('release-approver');
        expect(() => auth().authorizeApproval(actor, makeTask(), {performedBy: actor.id})).toThrow();
        expect(() => auth().authorizeApproval(actor, makeTask(), {performedBy: 'someone-else'})).not.toThrow();
    });
});
