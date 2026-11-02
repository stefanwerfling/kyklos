import {describe, expect, it} from 'vitest';
import {
    type Actor,
    ApprovalDecision,
    ApprovalService,
    CycleState,
    KyklosError,
    RandomIdGenerator,
    ReleaseGate,
    ReleaseOutcome,
    SystemClock,
    type Task
} from '../../src/index';
import {makeActor, makeCycle, makeTask} from '../fixtures';

const task: Task = {...makeTask(), mode: 'approval' as Task['mode'], assigneeRole: 'release-approver'};
const service = new ApprovalService({idGenerator: new RandomIdGenerator(), clock: new SystemClock()});

describe('ApprovalService', () => {
    it('refuses an approval from an actor lacking the required role', async () => {
        const intern: Actor = {...makeActor(), id: 'intern', roles: ['operator']};
        await expect(service.decide(task, intern, ApprovalDecision.Approve, 'ok')).rejects.toBeInstanceOf(KyklosError);
    });

    it('records an authorized approval', async () => {
        const approval = await service.decide(task, makeActor(), ApprovalDecision.Approve, 'release looks good');
        expect(approval.decision).toBe(ApprovalDecision.Approve);
        expect(approval.role).toBe('release-approver');
    });

    it('bridges an approve into a ReleaseGate override that authorizes the release', async () => {
        const approval = await service.decide(task, makeActor(), ApprovalDecision.Approve, 'release looks good');
        const decision = ReleaseGate.decide({
            cycle: {...makeCycle(), state: CycleState.ManualReleaseRequired},
            ruleVersion: '1.0.0',
            decidedBy: 'gate',
            idGenerator: new RandomIdGenerator(),
            clock: new SystemClock(),
            override: ApprovalService.toReleaseOverride(approval)
        });
        expect(decision.outcome).toBe(ReleaseOutcome.Approve);
        expect(decision.decidedBy).toBe('actor-1');
    });

    it('refuses to build an override from a rejected approval', async () => {
        const approval = await service.decide(task, makeActor(), ApprovalDecision.Reject, 'not ready');
        expect(() => ApprovalService.toReleaseOverride(approval)).toThrowError(KyklosError);
    });
});