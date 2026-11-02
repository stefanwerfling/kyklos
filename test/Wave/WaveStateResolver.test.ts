import {describe, expect, it} from 'vitest';
import {CycleState, WaveState, WaveStateResolver} from '../../src/index';

describe('WaveStateResolver', () => {
    it('passes a wave only when every environment passed', () => {
        expect(WaveStateResolver.resolveWave([CycleState.Passed, CycleState.Passed])).toBe(WaveState.Passed);
        expect(WaveStateResolver.resolveWave([CycleState.Passed, CycleState.Failed])).toBe(WaveState.Failed);
    });

    it('treats passed-with-deviations as passing and an empty wave as passed', () => {
        expect(WaveStateResolver.resolveWave([CycleState.PassedWithDeviations])).toBe(WaveState.Passed);
        expect(WaveStateResolver.resolveWave([])).toBe(WaveState.Passed);
    });

    it('fails a wave with a manual-release or aborted environment', () => {
        expect(WaveStateResolver.resolveWave([CycleState.ManualReleaseRequired])).toBe(WaveState.Failed);
        expect(WaveStateResolver.resolveWave([CycleState.Aborted])).toBe(WaveState.Failed);
    });

    it('derives overall state: failed dominates blocked dominates passed', () => {
        expect(WaveStateResolver.resolveOverall([WaveState.Passed, WaveState.Passed])).toBe(WaveState.Passed);
        expect(WaveStateResolver.resolveOverall([WaveState.Passed, WaveState.Blocked])).toBe(WaveState.Blocked);
        expect(WaveStateResolver.resolveOverall([WaveState.Failed, WaveState.Blocked])).toBe(WaveState.Failed);
    });
});
