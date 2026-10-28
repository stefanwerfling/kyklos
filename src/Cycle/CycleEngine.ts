/**
 * CycleEngine — executes a procedure's checklist end to end.
 *
 * It pins the checklist, runs each check through the CheckRunner, builds an
 * append-only Observation per check (and a Deviation per failed check),
 * derives the terminal cycle state via CycleStateResolver, and optionally
 * persists the whole run to a FileStore. Time and ids are injected so a run is
 * fully reproducible in tests.
 */
import {CheckStatus, Criticality, Severity} from '../Domain/Common.js';
import {Checklist} from '../Domain/Checklist.js';
import {Cycle, CycleSchema} from '../Domain/Cycle.js';
import {Deviation, DeviationSchema} from '../Domain/Deviation.js';
import {Observation, ObservationSchema} from '../Domain/Observation.js';
import {Procedure} from '../Domain/Procedure.js';
import {Project} from '../Domain/Project.js';
import {CheckRunner} from '../Runner/CheckRunner.js';
import {RunOptions} from '../Runner/AdapterTypes.js';
import {SignatureBuilder} from '../Learning/SignatureBuilder.js';
import {FileStore} from '../Store/FileStore.js';
import {Clock} from './Clock.js';
import {CheckStatusEntry, CycleStateResolver} from './CycleStateResolver.js';
import {IdGenerator} from './IdGenerator.js';

/**
 * Collaborators the cycle engine depends on.
 */
export interface CycleEngineOptions {

    /**
     * Runner used to execute each check.
     * @member {CheckRunner}
     */
    runner: CheckRunner;

    /**
     * Injected id source.
     * @member {IdGenerator}
     */
    idGenerator: IdGenerator;

    /**
     * Injected time source.
     * @member {Clock}
     */
    clock: Clock;

    /**
     * Optional store to persist the run (append-only).
     * @member {FileStore|undefined}
     */
    store?: FileStore;
}

/**
 * Input of a single cycle run.
 */
export interface RunCycleInput {

    /**
     * The project the cycle runs for.
     * @member {Project}
     */
    project: Project;

    /**
     * The pinned procedure.
     * @member {Procedure}
     */
    procedure: Procedure;

    /**
     * The pinned checklist.
     * @member {Checklist}
     */
    checklist: Checklist;

    /**
     * Optional per-check run options, keyed by check id.
     * @member {Record<string, RunOptions>|undefined}
     */
    runOptions?: Record<string, RunOptions>;
}

/**
 * Result of a cycle run.
 */
export interface CycleRunResult {

    /**
     * The produced cycle record.
     * @member {Cycle}
     */
    cycle: Cycle;

    /**
     * The produced observations.
     * @member {Observation[]}
     */
    observations: Observation[];

    /**
     * The produced deviations.
     * @member {Deviation[]}
     */
    deviations: Deviation[];
}

/**
 * Executes checklists and produces auditable, append-only cycle records.
 */
export class CycleEngine {

    /**
     * Runner used to execute checks.
     * @member {CheckRunner}
     */
    protected readonly _runner: CheckRunner;

    /**
     * Injected id source.
     * @member {IdGenerator}
     */
    protected readonly _idGenerator: IdGenerator;

    /**
     * Injected time source.
     * @member {Clock}
     */
    protected readonly _clock: Clock;

    /**
     * Optional persistence target.
     * @member {FileStore|undefined}
     */
    protected readonly _store: FileStore|undefined;

    /**
     * @param {CycleEngineOptions} options - Engine collaborators.
     */
    public constructor(options: CycleEngineOptions) {
        this._runner = options.runner;
        this._idGenerator = options.idGenerator;
        this._clock = options.clock;
        this._store = options.store;
    }

    /**
     * Run a full cycle.
     * @param {RunCycleInput} input - Project, procedure, checklist and options.
     * @returns {Promise<CycleRunResult>} The cycle, observations and deviations.
     */
    public async run(input: RunCycleInput): Promise<CycleRunResult> {
        const cycleId = this._idGenerator.next('cyc');
        const startedAt = this._clock.now();
        const observations: Observation[] = [];
        const deviations: Deviation[] = [];
        const entries: CheckStatusEntry[] = [];

        for (const check of input.checklist.checks) {
            const options = input.runOptions?.[check.id];
            // sequential by design — checks may have ordering side effects
            // eslint-disable-next-line no-await-in-loop
            const result = await this._runner.run(check, options);

            const observation: Observation = {
                id: this._idGenerator.next('obs'),
                checkId: check.id,
                checkVersion: check.version,
                status: result.status,
                actual: result.outcome,
                measuredAt: this._clock.now(),
                evidenceIds: []
            };
            observations.push(observation);
            entries.push({status: result.status, criticality: check.criticality});

            if (result.status === CheckStatus.Failed) {
                deviations.push({
                    id: this._idGenerator.next('dev'),
                    observationId: observation.id,
                    expected: {status: CheckStatus.Passed},
                    actual: {status: result.status, reason: result.reason},
                    severity: CycleEngine._severityFor(check.criticality),
                    signature: SignatureBuilder.build([check.group, check.id, result.status]),
                    evidenceIds: []
                });
            }
        }

        const cycle: Cycle = {
            id: cycleId,
            projectId: input.project.id,
            procedureId: input.procedure.id,
            procedureVersion: input.procedure.version,
            checklistId: input.checklist.id,
            checklistVersion: input.checklist.version,
            state: CycleStateResolver.resolve(entries),
            startedAt: startedAt,
            endedAt: this._clock.now(),
            observationIds: observations.map((observation): string => observation.id),
            deviationIds: deviations.map((deviation): string => deviation.id)
        };

        const result: CycleRunResult = {cycle: cycle, observations: observations, deviations: deviations};
        await this._persist(result);
        return result;
    }

    /**
     * Map a criticality to a deviation severity.
     * @param {Criticality} criticality - The check's criticality.
     * @returns {Severity} The corresponding deviation severity.
     */
    protected static _severityFor(criticality: Criticality): Severity {
        switch (criticality) {
            case Criticality.Critical:
                return Severity.High;
            case Criticality.Major:
                return Severity.Medium;
            default:
                return Severity.Low;
        }
    }

    /**
     * Persist the run to the store, if one is configured.
     * @param {CycleRunResult} result - The run to persist.
     * @returns {Promise<void>}
     */
    protected async _persist(result: CycleRunResult): Promise<void> {
        if (this._store === undefined) {
            return;
        }

        for (const observation of result.observations) {
            // sequential by design — append-only writes
            // eslint-disable-next-line no-await-in-loop
            await this._store.appendRecord('observation', ObservationSchema, observation);
        }

        for (const deviation of result.deviations) {
            // sequential by design — append-only writes
            // eslint-disable-next-line no-await-in-loop
            await this._store.appendRecord('deviation', DeviationSchema, deviation);
        }

        await this._store.appendRecord('cycle', CycleSchema, result.cycle);
    }

}