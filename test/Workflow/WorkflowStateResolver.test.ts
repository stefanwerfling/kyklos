import {describe, expect, it} from 'vitest';
import {CycleState, type PhaseStatusEntry, WorkflowStateResolver} from '../../src/index';

const entry = (over: Partial<PhaseStatusEntry>): PhaseStatusEntry => {
    return {optional: false, ...over};
};

describe('WorkflowStateResolver', () => {
    it('all passed -> passed', () => {
        expect(WorkflowStateResolver.resolve([entry({state: CycleState.Passed}), entry({state: CycleState.Passed})])).toBe(CycleState.Passed);
    });

    it('a critical failure -> failed, even with a pending phase', () => {
        expect(WorkflowStateResolver.resolve([entry({state: CycleState.Failed}), entry({state: undefined})])).toBe(CycleState.Failed);
    });

    it('a critical manual release -> manual_release_required', () => {
        expect(WorkflowStateResolver.resolve([entry({state: CycleState.ManualReleaseRequired})])).toBe(CycleState.ManualReleaseRequired);
    });

    it('an expected-but-unrun phase keeps it running', () => {
        expect(WorkflowStateResolver.resolve([entry({state: CycleState.Passed}), entry({state: undefined})])).toBe(CycleState.Running);
    });

    it('an optional failure -> passed_with_deviations', () => {
        expect(WorkflowStateResolver.resolve([entry({state: CycleState.Passed}), entry({optional: true, state: CycleState.Failed})])).toBe(CycleState.PassedWithDeviations);
    });

    it('a with-deviations pass -> passed_with_deviations', () => {
        expect(WorkflowStateResolver.resolve([entry({state: CycleState.PassedWithDeviations})])).toBe(CycleState.PassedWithDeviations);
    });

    it('a skipped phase is neutral', () => {
        expect(WorkflowStateResolver.resolve([entry({state: CycleState.Passed}), entry({skipped: true})])).toBe(CycleState.Passed);
    });
});