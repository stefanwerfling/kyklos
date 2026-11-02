/**
 * WaveController — rolls a workflow across environments in ordered waves.
 *
 * Each environment in a wave runs the workflow as one WorkflowRun through the
 * unchanged WorkflowEngine (W2). A wave passes only when every environment in
 * it passed (or passed with deviations); a failed wave blocks every later wave
 * — the gate between waves is explicit and deterministic, never an automatic
 * "continue anyway". The run header and each EnvironmentRun are appended, so the
 * store stays append-only and the rollout is resumable: `continue` re-runs only
 * the environments that have not passed yet and leaves the rest untouched.
 * Progress is announced through an optional Notifier that can never affect the
 * result (dispatch is guarded and messages are redacted).
 */
import {CycleState, WaveState} from '../Domain/Common.js';
import {Environment} from '../Domain/Environment.js';
import {Project} from '../Domain/Project.js';
import {TargetSystem} from '../Domain/TargetSystem.js';
import {EnvironmentRun, EnvironmentRunSchema, WaveRun, WaveRunSchema} from '../Domain/WaveRun.js';
import {Workflow} from '../Domain/Workflow.js';
import {Clock} from '../Cycle/Clock.js';
import {IdGenerator} from '../Cycle/IdGenerator.js';
import {LessonSanitizer} from '../Learning/LessonSanitizer.js';
import {NotificationEvent, NotificationKind, Notifier} from '../Notify/Notifier.js';
import {FileStore} from '../Store/FileStore.js';
import {WorkflowEngine} from '../Workflow/WorkflowEngine.js';
import {WaveStateResolver} from './WaveStateResolver.js';

/**
 * Collaborators the wave controller depends on.
 */
export interface WaveControllerOptions {
    engine: WorkflowEngine;
    idGenerator: IdGenerator;
    clock: Clock;
    store?: FileStore;
    notifier?: Notifier;
}

/**
 * Input of a wave rollout.
 */
export interface WaveRunInput {
    project: Project;
    workflow: Workflow;
    waves: Environment[][];
    resolveTarget: (environment: Environment) => TargetSystem;
}

/**
 * The disposition of one wave.
 */
export interface WaveOutcome {
    waveIndex: number;
    state: WaveState;
    environmentRuns: EnvironmentRun[];
}

/**
 * The outcome of a wave rollout.
 */
export interface WaveRunResult {
    run: WaveRun;
    waves: WaveOutcome[];
    environmentRuns: EnvironmentRun[];
    state: WaveState;
}

/**
 * Runs a workflow across environments in ordered, gated waves.
 */
export class WaveController {

    /**
     * Engine that runs the workflow against one environment.
     * @member {WorkflowEngine}
     */
    protected readonly _engine: WorkflowEngine;

    /**
     * Injected id source.
     * @member {IdGenerator}
     */
    protected readonly _idGenerator: IdGenerator;

    /**
     * Injected clock.
     * @member {Clock}
     */
    protected readonly _clock: Clock;

    /**
     * Optional store for the run header and environment runs.
     * @member {FileStore|undefined}
     */
    protected readonly _store: FileStore|undefined;

    /**
     * Optional notification side-channel (advisory, never affects the result).
     * @member {Notifier|undefined}
     */
    protected readonly _notifier: Notifier|undefined;

    /**
     * @param {WaveControllerOptions} options - Engine and injected collaborators.
     */
    public constructor(options: WaveControllerOptions) {
        this._engine = options.engine;
        this._idGenerator = options.idGenerator;
        this._clock = options.clock;
        this._store = options.store;
        this._notifier = options.notifier;
    }

    /**
     * Roll a workflow out across the given waves, gating between them.
     * @param {WaveRunInput} input - Project, workflow, ordered waves and the target resolver.
     * @returns {Promise<WaveRunResult>} The rollout header, per-wave outcomes and derived state.
     */
    public async run(input: WaveRunInput): Promise<WaveRunResult> {
        const run: WaveRun = {
            id: this._idGenerator.next('waverun'),
            workflowId: input.workflow.id,
            workflowVersion: input.workflow.version,
            projectId: input.project.id,
            startedAt: this._clock.now()
        };

        if (this._store !== undefined) {
            await this._store.appendRecord('waveRun', WaveRunSchema, run);
        }

        this._notify({kind: NotificationKind.RolloutStarted, waveRunId: run.id, message: `rollout of '${run.workflowId}' started`});
        return this._execute(input, run, []);
    }

    /**
     * Continue a rollout from its recorded environment runs (resume).
     * @param {WaveRunInput} input - The same project, workflow and waves.
     * @param {WaveRun} run - The existing rollout header.
     * @param {EnvironmentRun[]} priorRuns - The environment runs recorded so far.
     * @returns {Promise<WaveRunResult>} The continued rollout result.
     */
    public async continue(input: WaveRunInput, run: WaveRun, priorRuns: EnvironmentRun[]): Promise<WaveRunResult> {
        return this._execute(input, run, priorRuns);
    }

    /**
     * Core wave loop, shared by run() and continue().
     * @param {WaveRunInput} input - The rollout input.
     * @param {WaveRun} run - The rollout header.
     * @param {EnvironmentRun[]} priorRuns - Already-recorded environment runs (empty for a fresh rollout).
     * @returns {Promise<WaveRunResult>} The rollout result.
     */
    protected async _execute(input: WaveRunInput, run: WaveRun, priorRuns: EnvironmentRun[]): Promise<WaveRunResult> {
        const priorPassed = new Map<string, EnvironmentRun>();

        for (const priorRun of priorRuns) {
            if (WaveStateResolver.resolveWave([priorRun.state]) === WaveState.Passed) {
                priorPassed.set(`${priorRun.waveIndex}:${priorRun.environmentId}`, priorRun);
            }
        }

        const waves: WaveOutcome[] = [];
        const environmentRuns: EnvironmentRun[] = [];
        let blocked = false;

        for (const [waveIndex, wave] of input.waves.entries()) {
            if (blocked) {
                waves.push({waveIndex: waveIndex, state: WaveState.Blocked, environmentRuns: []});
                this._notify({kind: NotificationKind.WaveBlocked, waveRunId: run.id, waveIndex: waveIndex, waveState: WaveState.Blocked, message: `wave ${waveIndex} blocked by an earlier failure`});
                continue;
            }

            // sequential by design — a wave is gated before the next one starts
            // eslint-disable-next-line no-await-in-loop
            const waveRuns = await this._runWave(input, run.id, waveIndex, wave, priorPassed);
            environmentRuns.push(...waveRuns);

            const state = WaveStateResolver.resolveWave(waveRuns.map((environmentRun): CycleState => environmentRun.state));
            waves.push({waveIndex: waveIndex, state: state, environmentRuns: waveRuns});
            this._notify(WaveController._waveEvent(run.id, waveIndex, state));

            if (state === WaveState.Failed) {
                blocked = true;
            }
        }

        const overall = WaveStateResolver.resolveOverall(waves.map((wave): WaveState => wave.state));
        this._notify({kind: NotificationKind.RolloutCompleted, waveRunId: run.id, rolloutState: overall, message: `rollout of '${run.workflowId}' completed: ${overall}`});
        return {run: run, waves: waves, environmentRuns: environmentRuns, state: overall};
    }

    /**
     * Run (or reuse) every environment in one wave and record an EnvironmentRun each.
     * @param {WaveRunInput} input - The rollout input.
     * @param {string} waveRunId - The rollout header id.
     * @param {number} waveIndex - Zero-based index of this wave.
     * @param {Environment[]} wave - The environments in this wave.
     * @param {Map<string, EnvironmentRun>} priorPassed - Already-passed environment runs, by wave:env key.
     * @returns {Promise<EnvironmentRun[]>} The environment runs (reused where already passed).
     */
    protected async _runWave(input: WaveRunInput, waveRunId: string, waveIndex: number, wave: Environment[], priorPassed: Map<string, EnvironmentRun>): Promise<EnvironmentRun[]> {
        const runs: EnvironmentRun[] = [];

        for (const environment of wave) {
            const reused = priorPassed.get(`${waveIndex}:${environment.id}`);

            if (reused !== undefined) {
                runs.push(reused);
                continue;
            }

            const target = input.resolveTarget(environment);
            // sequential by design — environments within a wave run in order
            // eslint-disable-next-line no-await-in-loop
            const workflowResult = await this._engine.run({project: input.project, workflow: input.workflow, target: target});

            const environmentRun: EnvironmentRun = {
                id: this._idGenerator.next('envrun'),
                waveRunId: waveRunId,
                waveIndex: waveIndex,
                environmentId: environment.id,
                workflowRunId: workflowResult.run.id,
                state: workflowResult.state,
                recordedAt: this._clock.now()
            };

            if (this._store !== undefined) {
                // sequential by design — append in deterministic order
                // eslint-disable-next-line no-await-in-loop
                await this._store.appendRecord('environmentRun', EnvironmentRunSchema, environmentRun);
            }

            runs.push(environmentRun);
        }

        return runs;
    }

    /**
     * Dispatch a notification safely: redact a tripped message and never let a
     * failing notifier affect the rollout.
     * @param {NotificationEvent} event - The event to deliver.
     * @returns {void}
     */
    protected _notify(event: NotificationEvent): void {
        if (this._notifier === undefined) {
            return;
        }

        const sensitive = LessonSanitizer.findSensitive([event.message]);
        const safe = sensitive.length === 0 ? event : {...event, message: '[redacted]'};

        try {
            this._notifier.notify(safe);
        } catch {
            // Notifications are advisory — a failing notifier must never change the rollout.
        }
    }

    /**
     * Build the wave-level event for a resolved wave state.
     * @param {string} waveRunId - The rollout header id.
     * @param {number} waveIndex - The wave index.
     * @param {WaveState} state - The resolved wave state.
     * @returns {NotificationEvent} The wave event.
     */
    protected static _waveEvent(waveRunId: string, waveIndex: number, state: WaveState): NotificationEvent {
        const kind = state === WaveState.Passed ? NotificationKind.WavePassed : NotificationKind.WaveFailed;
        return {kind: kind, waveRunId: waveRunId, waveIndex: waveIndex, waveState: state, message: `wave ${waveIndex} ${state}`};
    }

}