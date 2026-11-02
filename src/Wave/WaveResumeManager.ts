/**
 * WaveResumeManager — reconstructs a rollout from the store and continues it.
 *
 * It loads the WaveRun header and the appended EnvironmentRuns, then hands them
 * to WaveController.continue. Environments that already passed are not re-run;
 * a failed environment (and the waves an earlier failure blocked) is retried.
 * Because EnvironmentRuns are append-only, a retry appends a new record and the
 * history is preserved. Mirrors ResumeManager for workflows.
 */
import {EnvironmentRun, EnvironmentRunSchema, WaveRun, WaveRunSchema} from '../Domain/WaveRun.js';
import {FileStore} from '../Store/FileStore.js';
import {WaveController, WaveRunInput, WaveRunResult} from './WaveController.js';

/**
 * Resumes rollouts from their persisted environment runs.
 */
export class WaveResumeManager {

    /**
     * The controller used to continue a rollout.
     * @member {WaveController}
     */
    protected readonly _controller: WaveController;

    /**
     * The store holding the rollout header and environment runs.
     * @member {FileStore}
     */
    protected readonly _store: FileStore;

    /**
     * @param {WaveController} controller - The wave controller.
     * @param {FileStore} store - The store to read rollout records from.
     */
    public constructor(controller: WaveController, store: FileStore) {
        this._controller = controller;
        this._store = store;
    }

    /**
     * Resume a rollout by its id.
     * @param {string} waveRunId - The rollout id to resume.
     * @param {WaveRunInput} input - The same project, workflow, waves and resolver.
     * @returns {Promise<WaveRunResult>} The continued rollout result.
     */
    public async resume(waveRunId: string, input: WaveRunInput): Promise<WaveRunResult> {
        const run: WaveRun = await this._store.getRecord('waveRun', waveRunId, WaveRunSchema);
        const allRuns = await this._store.listRecords('environmentRun', EnvironmentRunSchema);
        const priorRuns = allRuns.filter((environmentRun: EnvironmentRun): boolean => environmentRun.waveRunId === waveRunId);
        return this._controller.continue(input, run, priorRuns);
    }

}