import {describe, expect, it} from 'vitest';
import {CycleState, type EnvironmentRun, RolloutReportBuilder, WaveState} from '../../src/index';
import {makeEnvironmentRun, makeWaveRun} from '../fixtures';

const run = makeWaveRun();
const envRun = (overrides: Partial<EnvironmentRun>): EnvironmentRun => {
    return {...makeEnvironmentRun(), ...overrides};
};

describe('RolloutReportBuilder', () => {
    it('groups environment runs by wave and derives states, overall and risks', () => {
        const report = RolloutReportBuilder.build({
            run: run,
            environmentRuns: [
                envRun({id: 'e1', waveIndex: 0, environmentId: 'env-a', state: CycleState.Passed}),
                envRun({id: 'e2', waveIndex: 1, environmentId: 'env-b', state: CycleState.Failed})
            ]
        });

        expect(report.waveRunId).toBe(run.id);
        expect(report.waves.map((wave) => wave.state)).toEqual([WaveState.Passed, WaveState.Failed]);
        expect(report.state).toBe(WaveState.Failed);
        expect(report.openRisks).toEqual(['env-b: failed']);
    });

    it('reports a passed rollout with no open risks', () => {
        const report = RolloutReportBuilder.build({
            run: run,
            environmentRuns: [
                envRun({id: 'e1', waveIndex: 0, environmentId: 'env-a', state: CycleState.Passed}),
                envRun({id: 'e2', waveIndex: 0, environmentId: 'env-b', state: CycleState.PassedWithDeviations})
            ]
        });

        expect(report.state).toBe(WaveState.Passed);
        expect(report.waves).toHaveLength(1);
        expect(report.waves[0].environments).toHaveLength(2);
        expect(report.openRisks).toEqual([]);
    });
});
