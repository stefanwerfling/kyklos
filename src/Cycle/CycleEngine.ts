/**
 * CycleEngine — executes a procedure's checklist end to end.
 *
 * It pins the checklist, runs each check through the CheckRunner, builds an
 * append-only Observation per check (and a Deviation per failed check),
 * derives the terminal cycle state via CycleStateResolver, and optionally
 * persists the whole run to a FileStore. Time and ids are injected so a run is
 * fully reproducible in tests.
 */
import {AdapterKind, CheckStatus, Criticality, Severity} from '../Domain/Common.js';
import {Check} from '../Domain/Check.js';
import {Checklist} from '../Domain/Checklist.js';
import {Cycle, CycleSchema} from '../Domain/Cycle.js';
import {Deviation, DeviationSchema} from '../Domain/Deviation.js';
import {Evidence, EvidenceSchema} from '../Domain/Evidence.js';
import {Observation, ObservationSchema} from '../Domain/Observation.js';
import {Procedure} from '../Domain/Procedure.js';
import {Project} from '../Domain/Project.js';
import {ToolExecution, ToolExecutionSchema} from '../Domain/ToolExecution.js';
import {EvidenceFactory} from '../Execution/EvidenceFactory.js';
import {ProcessRunner} from '../Execution/ProcessRunner.js';
import {CheckRunner} from '../Runner/CheckRunner.js';
import {PreconditionEvaluator} from '../Runner/PreconditionEvaluator.js';
import {RunOptions} from '../Runner/AdapterTypes.js';
import {SignatureBuilder} from '../Learning/SignatureBuilder.js';
import {PermissionPolicy} from '../Security/PermissionPolicy.js';
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

    /**
     * Optional permission policy enforced on each action (fail-closed).
     * @member {PermissionPolicy|undefined}
     */
    policy?: PermissionPolicy;
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

    /**
     * Confirmed manual checks, keyed by check id. A true value seeds the manual
     * action's confirmation so the check can pass; attribution is recorded
     * separately as a ManualConfirmation, so this is never an anonymous flag.
     * @member {Record<string, boolean>|undefined}
     */
    confirmations?: Record<string, boolean>;
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

    /**
     * The tool-execution records, one per check.
     * @member {ToolExecution[]}
     */
    toolExecutions: ToolExecution[];

    /**
     * The evidence produced for the observations.
     * @member {Evidence[]}
     */
    evidence: Evidence[];
}

/**
 * Executes checklists and produces auditable, append-only cycle records.
 */
export class CycleEngine {

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
     * Recording runner that enforces permissions and builds ToolExecutions.
     * @member {ProcessRunner}
     */
    protected readonly _processRunner: ProcessRunner;

    /**
     * @param {CycleEngineOptions} options - Engine collaborators.
     */
    public constructor(options: CycleEngineOptions) {
        this._idGenerator = options.idGenerator;
        this._clock = options.clock;
        this._store = options.store;
        this._processRunner = new ProcessRunner(options.runner, options.clock, options.idGenerator, options.policy);
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
        const toolExecutions: ToolExecution[] = [];
        const evidence: Evidence[] = [];
        const entries: CheckStatusEntry[] = [];
        const statuses = new Map<string, CheckStatus>();

        for (const check of input.checklist.checks) {
            const base = input.runOptions?.[check.id];
            const precondsOk = PreconditionEvaluator.satisfied(check.preconditions, statuses);
            const options: RunOptions = {...base, applicable: (base?.applicable ?? true) && precondsOk};
            const effectiveCheck = CycleEngine._confirmed(check, input.confirmations?.[check.id] === true);
            // sequential by design — checks may have ordering side effects
            // eslint-disable-next-line no-await-in-loop
            const result = await this._processRunner.run(effectiveCheck, options, cycleId);
            statuses.set(check.id, result.status);
            toolExecutions.push(result.execution);

            const proof = EvidenceFactory.fromToolExecution(result.execution, this._idGenerator.next('ev'), this._clock.now());
            evidence.push(proof);

            const observation: Observation = {
                id: this._idGenerator.next('obs'),
                checkId: check.id,
                checkVersion: check.version,
                status: result.status,
                actual: result.outcome,
                measuredAt: this._clock.now(),
                evidenceIds: [proof.id]
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

        const result: CycleRunResult = {cycle: cycle, observations: observations, deviations: deviations, toolExecutions: toolExecutions, evidence: evidence};
        await this._persist(result);
        return result;
    }

    /**
     * Seed a manual check's confirmation when the operator confirmed it.
     * Only manual actions are touched, so other adapters' strict params stay intact.
     * @param {Check} check - The check about to run.
     * @param {boolean} confirmed - Whether the operator confirmed this check.
     * @returns {Check} The check, with confirmed:true merged in for a confirmed manual action.
     */
    protected static _confirmed(check: Check, confirmed: boolean): Check {
        if (!confirmed || check.action.adapter !== AdapterKind.Manual) {
            return check;
        }

        const params = (check.action.params ?? {}) as Record<string, unknown>;
        return {...check, action: {...check.action, params: {...params, confirmed: true}}};
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

        for (const execution of result.toolExecutions) {
            // sequential by design — append-only writes
            // eslint-disable-next-line no-await-in-loop
            await this._store.appendRecord('toolExecution', ToolExecutionSchema, execution);
        }

        for (const proof of result.evidence) {
            // sequential by design — append-only writes
            // eslint-disable-next-line no-await-in-loop
            await this._store.appendRecord('evidence', EvidenceSchema, proof);
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