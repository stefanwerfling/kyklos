import {describe, expect, it} from 'vitest';
import {type Cycle, CycleState, KyklosError, KyklosErrorCode, ReleaseGate, ReleaseOutcome} from '../../src/index';
import {makeCycle} from '../fixtures';
import {FixedClock, SequentialIdGenerator} from '../doubles';

const cycleIn = (state: CycleState): Cycle => {
    return {...makeCycle(), state: state};
};

const decide = (state: CycleState, override?: {decidedBy: string; justification: string;}) => {
    return ReleaseGate.decide({
        cycle: cycleIn(state),
        ruleVersion: '1.0.0',
        decidedBy: 'release-gate',
        idGenerator: new SequentialIdGenerator(),
        clock: new FixedClock(),
        override: override
    });
};

describe('ReleaseGate', () => {
    it('approves a passed cycle', () => {
        expect(decide(CycleState.Passed).outcome).toBe(ReleaseOutcome.Approve);
    });

    it('approves a passed_with_deviations cycle', () => {
        expect(decide(CycleState.PassedWithDeviations).outcome).toBe(ReleaseOutcome.Approve);
    });

    it('rejects a failed cycle without override', () => {
        expect(decide(CycleState.Failed).outcome).toBe(ReleaseOutcome.Reject);
    });

    it('rejects manual_release_required without override', () => {
        expect(decide(CycleState.ManualReleaseRequired).outcome).toBe(ReleaseOutcome.Reject);
    });

    it('approves a blocked cycle with an authorized override and records it', () => {
        const decision = decide(CycleState.ManualReleaseRequired, {decidedBy: 'alice', justification: 'hotfix window approved'});
        expect(decision.outcome).toBe(ReleaseOutcome.Approve);
        expect(decision.decidedBy).toBe('alice');
        expect(decision.overrides).toEqual(['hotfix window approved']);
    });

    it('does not approve on an override with empty justification', () => {
        expect(decide(CycleState.Failed, {decidedBy: 'alice', justification: ''}).outcome).toBe(ReleaseOutcome.Reject);
    });

    it('aborts an aborted cycle', () => {
        expect(decide(CycleState.Aborted).outcome).toBe(ReleaseOutcome.Abort);
    });

    it('throws for a non-decidable state', () => {
        try {
            decide(CycleState.Running);
            expect.unreachable('should have thrown');
        } catch (error) {
            expect(error).toBeInstanceOf(KyklosError);
            expect((error as KyklosError).code).toBe(KyklosErrorCode.InvalidState);
        }
    });
});