import {describe, expect, it} from 'vitest';
import {type CheckStatusEntry, CheckStatus, Criticality, CycleState, CycleStateResolver} from '../../src/index';

const ALL_STATUSES = [
    CheckStatus.Passed,
    CheckStatus.Failed,
    CheckStatus.Skipped,
    CheckStatus.NotApplicable,
    CheckStatus.NotExecutable,
    CheckStatus.Unknown
];

const GATE = [CheckStatus.Skipped, CheckStatus.NotExecutable, CheckStatus.Unknown];

describe('CycleStateResolver — single critical check', () => {
    const expected: Record<string, CycleState> = {
        [CheckStatus.Passed]: CycleState.Passed,
        [CheckStatus.Failed]: CycleState.Failed,
        [CheckStatus.NotApplicable]: CycleState.Passed,
        [CheckStatus.Skipped]: CycleState.ManualReleaseRequired,
        [CheckStatus.NotExecutable]: CycleState.ManualReleaseRequired,
        [CheckStatus.Unknown]: CycleState.ManualReleaseRequired
    };

    for (const status of ALL_STATUSES) {
        it(`critical ${status} -> ${expected[status]}`, () => {
            const entries: CheckStatusEntry[] = [{status: status, criticality: Criticality.Critical}];
            expect(CycleStateResolver.resolve(entries)).toBe(expected[status]);
        });
    }
});

describe('CycleStateResolver — single non-critical check', () => {
    const expected: Record<string, CycleState> = {
        [CheckStatus.Passed]: CycleState.Passed,
        [CheckStatus.NotApplicable]: CycleState.Passed,
        [CheckStatus.Failed]: CycleState.PassedWithDeviations,
        [CheckStatus.Skipped]: CycleState.PassedWithDeviations,
        [CheckStatus.NotExecutable]: CycleState.PassedWithDeviations,
        [CheckStatus.Unknown]: CycleState.PassedWithDeviations
    };

    for (const status of ALL_STATUSES) {
        it(`major ${status} -> ${expected[status]}`, () => {
            const entries: CheckStatusEntry[] = [{status: status, criticality: Criticality.Major}];
            expect(CycleStateResolver.resolve(entries)).toBe(expected[status]);
        });
    }
});

describe('CycleStateResolver — invariants over all combinations', () => {
    it('a critical gate status never yields a passing state', () => {
        for (const criticalStatus of GATE) {
            for (const otherStatus of ALL_STATUSES) {
                const entries: CheckStatusEntry[] = [
                    {status: criticalStatus, criticality: Criticality.Critical},
                    {status: otherStatus, criticality: Criticality.Minor}
                ];
                const state = CycleStateResolver.resolve(entries);
                expect(state).not.toBe(CycleState.Passed);
                expect(state).not.toBe(CycleState.PassedWithDeviations);
            }
        }
    });

    it('a critical failed check always yields failed, even with other gate statuses', () => {
        for (const otherStatus of ALL_STATUSES) {
            const entries: CheckStatusEntry[] = [
                {status: CheckStatus.Failed, criticality: Criticality.Critical},
                {status: otherStatus, criticality: Criticality.Critical}
            ];
            expect(CycleStateResolver.resolve(entries)).toBe(CycleState.Failed);
        }
    });

    it('all passed/not_applicable yields passed', () => {
        const entries: CheckStatusEntry[] = [
            {status: CheckStatus.Passed, criticality: Criticality.Critical},
            {status: CheckStatus.NotApplicable, criticality: Criticality.Major},
            {status: CheckStatus.Passed, criticality: Criticality.Minor}
        ];
        expect(CycleStateResolver.resolve(entries)).toBe(CycleState.Passed);
    });
});