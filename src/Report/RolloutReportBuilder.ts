/**
 * RolloutReportBuilder — assembles a deterministic report of a wave rollout.
 *
 * It groups a rollout's EnvironmentRuns by wave, derives each wave's state and
 * the overall state through the shared WaveStateResolver (so the report reads
 * the same gate the controller applied), and lists the environments that did
 * not pass as open risks. A pure function of its inputs — no time is read, and
 * only ids and states appear, never a host or address. Waves that never ran
 * (blocked by an earlier failure) have no records and so do not appear; the
 * overall state still reflects the failure that blocked them.
 */
import {CycleState, WaveState} from '../Domain/Common.js';
import {EnvironmentRun, WaveRun} from '../Domain/WaveRun.js';
import {WaveStateResolver} from '../Wave/WaveStateResolver.js';

/**
 * One environment's line in a rollout report.
 */
export interface RolloutEnvironmentLine {

    /**
     * The environment id.
     * @member {string}
     */
    environmentId: string;

    /**
     * The workflow run produced for this environment.
     * @member {string}
     */
    workflowRunId: string;

    /**
     * The derived state of the environment's workflow run.
     * @member {string}
     */
    state: string;
}

/**
 * One wave's section in a rollout report.
 */
export interface RolloutWaveLine {

    /**
     * The wave index.
     * @member {number}
     */
    waveIndex: number;

    /**
     * The derived wave state.
     * @member {WaveState}
     */
    state: WaveState;

    /**
     * The environments in this wave.
     * @member {RolloutEnvironmentLine[]}
     */
    environments: RolloutEnvironmentLine[];
}

/**
 * A full, machine-readable rollout report.
 */
export interface RolloutReport {

    /**
     * The rollout (WaveRun) id.
     * @member {string}
     */
    waveRunId: string;

    /**
     * The workflow that was rolled out.
     * @member {string}
     */
    workflowId: string;

    /**
     * The project id.
     * @member {string}
     */
    projectId: string;

    /**
     * The derived overall rollout state.
     * @member {WaveState}
     */
    state: WaveState;

    /**
     * The per-wave sections, ordered by wave index.
     * @member {RolloutWaveLine[]}
     */
    waves: RolloutWaveLine[];

    /**
     * Open risks: environments that did not pass.
     * @member {string[]}
     */
    openRisks: string[];
}

/**
 * The raw inputs for a rollout report.
 */
export interface RolloutReportInput {

    /**
     * The rollout header.
     * @member {WaveRun}
     */
    run: WaveRun;

    /**
     * The environment runs recorded for the rollout.
     * @member {EnvironmentRun[]}
     */
    environmentRuns: EnvironmentRun[];
}

/**
 * Static builder of rollout reports.
 */
export class RolloutReportBuilder {

    /**
     * Build a rollout report from the header and environment runs.
     * @param {RolloutReportInput} input - The rollout header and its environment runs.
     * @returns {RolloutReport} The assembled report.
     */
    public static build(input: RolloutReportInput): RolloutReport {
        const byWave = new Map<number, EnvironmentRun[]>();

        for (const environmentRun of input.environmentRuns) {
            const group = byWave.get(environmentRun.waveIndex) ?? [];
            group.push(environmentRun);
            byWave.set(environmentRun.waveIndex, group);
        }

        const waveIndices = [...byWave.keys()].sort((left, right): number => left - right);

        const waves = waveIndices.map((waveIndex): RolloutWaveLine => {
            const group = byWave.get(waveIndex) ?? [];
            return {
                waveIndex: waveIndex,
                state: WaveStateResolver.resolveWave(group.map((environmentRun): CycleState => environmentRun.state)),
                environments: group.map((environmentRun): RolloutEnvironmentLine => {
                    return {environmentId: environmentRun.environmentId, workflowRunId: environmentRun.workflowRunId, state: environmentRun.state};
                })
            };
        });

        return {
            waveRunId: input.run.id,
            workflowId: input.run.workflowId,
            projectId: input.run.projectId,
            state: WaveStateResolver.resolveOverall(waves.map((wave): WaveState => wave.state)),
            waves: waves,
            openRisks: RolloutReportBuilder._openRisks(input.environmentRuns)
        };
    }

    /**
     * Derive open risks: the environments that did not pass.
     * @param {EnvironmentRun[]} environmentRuns - All environment runs.
     * @returns {string[]} One note per non-passing environment.
     */
    protected static _openRisks(environmentRuns: EnvironmentRun[]): string[] {
        return environmentRuns
        .filter((environmentRun): boolean => WaveStateResolver.resolveWave([environmentRun.state]) === WaveState.Failed)
        .map((environmentRun): string => `${environmentRun.environmentId}: ${environmentRun.state}`);
    }

}