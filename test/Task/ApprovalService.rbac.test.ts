/**
 * ApprovalService over the W6 AuthorizationService: an approval now needs the
 * capability (production needs its own), and the approver may not be the actor
 * who performed the work. Without an AuthorizationService the W3 role-string
 * behaviour is unchanged (covered by ApprovalService.test.ts).
 */
import {describe, expect, it} from 'vitest';
import {
    type Actor,
    ApprovalDecision,
    ApprovalService,
    AuthorizationService,
    Capability,
    EnvironmentKind,
    PermissionTier,
    type Role,
    RoleRegistry
} from '../../src/index';
import {FixedClock, SequentialIdGenerator} from '../doubles';
import {makeRole, makeTask} from '../fixtures';

const operator: Role = {id: 'operator', version: '1.0.0', name: 'Operator', capabilities: [Capability.SubmitFeedback], maxTier: PermissionTier.Shared};
const prodApprover: Role = {id: 'prod-approver', version: '1.0.0', name: 'Prod approver', capabilities: [Capability.ApproveRelease, Capability.ApproveProductionRelease], maxTier: PermissionTier.Production};

const approver: Actor = {id: 'approver-1', name: 'Approver', roles: ['release-approver']};
const worker: Actor = {id: 'worker-1', name: 'Worker', roles: ['operator']};
const prodApproverActor: Actor = {id: 'prod-1', name: 'ProdApprover', roles: ['prod-approver']};

const service = (): ApprovalService => {
    const authorization = new AuthorizationService(new RoleRegistry([makeRole(), operator, prodApprover]));
    return new ApprovalService({idGenerator: new SequentialIdGenerator(), clock: new FixedClock(), authorization: authorization});
};

describe('ApprovalService with RBAC', () => {
    it('records an approval for an authorized approver', async () => {
        const approval = await service().decide(makeTask(), approver, ApprovalDecision.Approve, 'looks good');
        expect(approval.decision).toBe(ApprovalDecision.Approve);
        expect(approval.actorId).toBe('approver-1');
    });

    it('refuses an actor without the approve capability', async () => {
        await expect(service().decide(makeTask(), worker, ApprovalDecision.Approve, 'nope')).rejects.toThrow();
    });

    it('refuses to let the performer approve their own work (separation of duties)', async () => {
        await expect(service().decide(makeTask(), approver, ApprovalDecision.Approve, 'self', {performedBy: approver.id})).rejects.toThrow();
    });

    it('refuses a production release without the production capability', async () => {
        await expect(service().decide(makeTask(), approver, ApprovalDecision.Approve, 'prod', {environmentKind: EnvironmentKind.Production})).rejects.toThrow();
    });

    it('allows a production release for an actor holding the production capability', async () => {
        const approval = await service().decide(makeTask(), prodApproverActor, ApprovalDecision.Approve, 'prod ok', {environmentKind: EnvironmentKind.Production});
        expect(approval.decision).toBe(ApprovalDecision.Approve);
    });
});
