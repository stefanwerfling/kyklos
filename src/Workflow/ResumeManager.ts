/**
 * ResumeManager — reconstructs a workflow run from the store and continues it.
 *
 * It loads the run header and the appended PhaseRuns, then hands them to
 * WorkflowEngine.continue. Phases that already passed are not re-run; a failed
 * or paused phase is retried. Because PhaseRuns are append-only, a retry simply
 * appends a new record — the history is preserved.
 */
import {PhaseRunSchema, WorkflowRunSchema} from '../Domain/WorkflowRun.js';
import {FileStore} from '../Store/FileStore.js';
import {WorkflowEngine, WorkflowRunInput, WorkflowRunResult} from './WorkflowEngine.js';

/**
 * Resumes workflow runs from their persisted phase runs.
 */
export class ResumeManager {

    /**
     * The engine used to continue a run.
     * @member {WorkflowEngine}
     */
    protected readonly _engine: WorkflowEngine;

    /**
     * The store holding the run header and phase runs.
     * @member {FileStore}
     */
    protected readonly _store: FileStore;

    /**
     * @param {WorkflowEngine} engine - The workflow engine.
     * @param {FileStore} store - The store to read run records from.
     */
    public constructor(engine: WorkflowEngine, store: FileStore) {
        this._engine = engine;
        this._store = store;
    }

    /**
     * Resume a workflow run by its id.
     * @param {string} workflowRunId - The run id to resume.
     * @param {WorkflowRunInput} input - Project, workflow and target (the same definition).
     * @returns {Promise<WorkflowRunResult>} The continued run result.
     */
    public async resume(workflowRunId: string, input: WorkflowRunInput): Promise<WorkflowRunResult> {
        const run = await this._store.getRecord('workflowRun', workflowRunId, WorkflowRunSchema);
        const allPhaseRuns = await this._store.listRecords('phaseRun', PhaseRunSchema);
        const priorRuns = allPhaseRuns.filter((phaseRun): boolean => phaseRun.workflowRunId === workflowRunId);
        return this._engine.continue(input, run, priorRuns);
    }

}