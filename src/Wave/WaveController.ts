/**
 * WaveController — rolls a workflow across environments in ordered waves.
 *
 * Each environment in a wave runs the workflow as one WorkflowRun through the
 * unchanged WorkflowEngine (W2). A wave passes only when every environment in
 * it passed (or passed with deviations); a failed wave blocks every later wave
 * — the gate between waves is explicit and deterministic, never an automatic
 * "continue anyway". The run header and each EnvironmentRun are appended, so the
 * store stays append-only and the rollout is auditable (and later resumable).
 */
import {CycleState, WaveState} from '../Domain/Common.js';
import {Environment} from '../Domain/Environment.js';
import {Project} from '../Domain/Project.js';
import {TargetSystem} from '../Domain/TargetSystem.js';
import {EnvironmentRun, EnvironmentRunSchema, WaveRun, WaveRunSchema} from '../Domain/WaveRun.js';
import {Workflow} from '../Domain/Workflow.js';
import {Clock} from '../Cycle/Clock.js';
import {IdGenerator} from '../Cycle/IdGenerator.js';
import {FileStore} from '../Store/FileStore.js';
import {WorkflowEngine} from '../Workflow/WorkflowEngine.js';

const PASSING = new Set<CycleState>([CycleState.Passed, CycleState.PassedWithDeviations]);

/**
 * Collaborators the wave controller depends on.
 */
export interface WaveControllerOptions {
    engine: WorkflowEngine;
    idGenerator: IdGenerator;
    clock: Clock;
    store?: FileStore;
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
     * @param {WaveControllerOptions} options - Engine and injected collaborators.
     */
    public constructor(options: WaveControllerOptions) {
        this._engine = options.engine;
        this._idGenerator = options.idGenerator;
        this._clock = options.clock;
        this._store = options.store;
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

        const waves: WaveOutcome[] = [];
        const environmentRuns: EnvironmentRun[] = [];
        let blocked = false;

        for (const [waveIndex, wave] of input.waves.entries()) {
            if (blocked) {
                waves.push({waveIndex: waveIndex, state: WaveState.Blocked, environmentRuns: []});
                continue;
            }

            // sequential by design — a wave is gated before the next one starts
            // eslint-disable-next-line no-await-in-loop
            const waveRuns = await this._runWave(input, run.id, waveIndex, wave);
            environmentRuns.push(...waveRuns);

            const passed = waveRuns.every((environmentRun): boolean => PASSING.has(environmentRun.state));
            waves.push({waveIndex: waveIndex, state: passed ? WaveState.Passed : WaveState.Failed, environmentRuns: waveRuns});

            if (passed === false) {
                blocked = true;
            }
        }

        return {run: run, waves: waves, environmentRuns: environmentRuns, state: WaveController._overallState(waves)};
    }

    /**
     * Run every environment in one wave and record an EnvironmentRun each.
     * @param {WaveRunInput} input - The rollout input.
     * @param {string} waveRunId - The rollout header id.
     * @param {number} waveIndex - Zero-based index of this wave.
     * @param {Environment[]} wave - The environments in this wave.
     * @returns {Promise<EnvironmentRun[]>} The recorded environment runs.
     */
    protected async _runWave(input: WaveRunInput, waveRunId: string, waveIndex: number, wave: Environment[]): Promise<EnvironmentRun[]> {
        const runs: EnvironmentRun[] = [];

        for (const environment of wave) {
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
     * Derive the overall rollout state from the wave outcomes.
     * @param {WaveOutcome[]} waves - The per-wave outcomes.
     * @returns {WaveState} Failed if any wave failed, Blocked if any was blocked, else Passed.
     */
    protected static _overallState(waves: WaveOutcome[]): WaveState {
        if (waves.some((wave): boolean => wave.state === WaveState.Failed)) {
            return WaveState.Failed;
        }

        if (waves.some((wave): boolean => wave.state === WaveState.Blocked)) {
            return WaveState.Blocked;
        }

        return WaveState.Passed;
    }

}