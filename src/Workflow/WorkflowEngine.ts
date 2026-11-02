/**
 * WorkflowEngine — runs a workflow's phases over the existing execution core.
 *
 * Each phase is executed by a PhaseExecutor (PlanExecutor from W1) as exactly
 * one cycle; the phase gate reads the resulting CycleState. Phases run in
 * dependency order (a cycle in the phase graph is refused via DependencyGraph).
 * A critical failure stops normal phases but still lets recovery phases
 * (runOn=on_prior_failure) run, and triggers the failed phase's rollback; a
 * critical manual release pauses the whole run. The run header is written once;
 * each executed phase appends an immutable PhaseRun, so the run is resumable and
 * the store stays append-only. The overall state is derived by
 * WorkflowStateResolver — no second status logic.
 */
import {CycleState, WorkflowPhaseRunOn} from '../Domain/Common.js';
import {ExecutionPlan} from '../Domain/ExecutionPlan.js';
import {PhaseRoot, Workflow, WorkflowPhase} from '../Domain/Workflow.js';
import {PhaseRun, PhaseRunSchema, WorkflowRun, WorkflowRunSchema} from '../Domain/WorkflowRun.js';
import {Project} from '../Domain/Project.js';
import {TargetSystem} from '../Domain/TargetSystem.js';
import {Clock} from '../Cycle/Clock.js';
import {CycleRunResult} from '../Cycle/CycleEngine.js';
import {IdGenerator} from '../Cycle/IdGenerator.js';
import {DependencyGraph} from '../Playbook/DependencyGraph.js';
import {FileStore} from '../Store/FileStore.js';
import {PhaseStatusEntry, WorkflowStateResolver} from './WorkflowStateResolver.js';

/**
 * Executes one phase root as a cycle (satisfied by PlanExecutor from W1).
 */
export interface PhaseExecutor {

    /**
     * @param {object} input - Project, target and the phase root.
     * @returns {Promise<{plan: ExecutionPlan; cycle?: CycleRunResult;}>} The plan and cycle (if executed).
     */
    run(input: {project: Project; target: TargetSystem; root: PhaseRoot;}): Promise<{plan: ExecutionPlan; cycle?: CycleRunResult;}>;
}

/**
 * Collaborators the workflow engine depends on.
 */
export interface WorkflowEngineOptions {
    executor: PhaseExecutor;
    idGenerator: IdGenerator;
    clock: Clock;
    store?: FileStore;
}

/**
 * Input of a workflow run.
 */
export interface WorkflowRunInput {
    project: Project;
    workflow: Workflow;
    target: TargetSystem;
}

/**
 * The outcome of a workflow run.
 */
export interface WorkflowRunResult {
    run: WorkflowRun;
    phaseRuns: PhaseRun[];
    state: CycleState;
    diagnostics: string[];
}

const PASSING = new Set<CycleState>([CycleState.Passed, CycleState.PassedWithDeviations]);

/**
 * Runs workflows as ordered phases over the execution core.
 */
export class WorkflowEngine {

    /**
     * Executor that runs each phase as a cycle.
     * @member {PhaseExecutor}
     */
    protected readonly _executor: PhaseExecutor;

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
     * Optional store for the run header and phase runs.
     * @member {FileStore|undefined}
     */
    protected readonly _store: FileStore|undefined;

    /**
     * @param {WorkflowEngineOptions} options - Executor and injected collaborators.
     */
    public constructor(options: WorkflowEngineOptions) {
        this._executor = options.executor;
        this._idGenerator = options.idGenerator;
        this._clock = options.clock;
        this._store = options.store;
    }

    /**
     * Run a workflow. Fresh run: writes the header, executes phases in order.
     * @param {WorkflowRunInput} input - Project, workflow and target.
     * @returns {Promise<WorkflowRunResult>} The run, its phase runs, derived state and diagnostics.
     */
    public async run(input: WorkflowRunInput): Promise<WorkflowRunResult> {
        const run: WorkflowRun = {
            id: this._idGenerator.next('wfrun'),
            workflowId: input.workflow.id,
            workflowVersion: input.workflow.version,
            projectId: input.project.id,
            startedAt: this._clock.now()
        };

        if (this._store !== undefined) {
            await this._store.appendRecord('workflowRun', WorkflowRunSchema, run);
        }

        return this._execute(input, run, []);
    }

    /**
     * Continue an existing run from its recorded phase runs (resume).
     * @param {WorkflowRunInput} input - Project, workflow and target.
     * @param {WorkflowRun} run - The existing run header.
     * @param {PhaseRun[]} priorRuns - The phase runs recorded so far.
     * @returns {Promise<WorkflowRunResult>} The continued run result.
     */
    public async continue(input: WorkflowRunInput, run: WorkflowRun, priorRuns: PhaseRun[]): Promise<WorkflowRunResult> {
        return this._execute(input, run, priorRuns);
    }

    /**
     * Core phase loop, shared by run() and continue().
     * @param {WorkflowRunInput} input - The run input.
     * @param {WorkflowRun} run - The run header.
     * @param {PhaseRun[]} priorRuns - Already-recorded phase runs (empty for a fresh run).
     * @returns {Promise<WorkflowRunResult>} The run result.
     */
    protected async _execute(input: WorkflowRunInput, run: WorkflowRun, priorRuns: PhaseRun[]): Promise<WorkflowRunResult> {
        const diagnostics: string[] = [];
        const childrenOf = (id: string): string[] => WorkflowEngine._dependsOn(id, input.workflow);

        for (const phase of input.workflow.phases) {
            const cycle = DependencyGraph.detectCycle(phase.id, childrenOf);

            if (cycle !== undefined) {
                diagnostics.push(`phase dependency cycle: ${cycle.join(' -> ')}`);
                return {run: run, phaseRuns: priorRuns, state: CycleState.Failed, diagnostics: diagnostics};
            }
        }

        const phaseRuns: PhaseRun[] = [...priorRuns];
        const finalState = new Map<string, CycleState|undefined>();
        const skipped = new Set<string>();

        // Resume: keep only passed phases; a failed or paused phase is retried.
        for (const prior of priorRuns) {
            if (PASSING.has(prior.state)) {
                finalState.set(prior.phaseId, prior.state);
            }
        }

        let criticalFailed = [...finalState.values()].some((state): boolean => state === CycleState.Failed);
        let paused = false;

        for (const phase of WorkflowEngine._order(input.workflow.phases)) {
            if (finalState.has(phase.id)) {
                continue;
            }

            if (paused) {
                continue;
            }

            if (!WorkflowEngine._shouldRun(phase, criticalFailed, finalState)) {
                skipped.add(phase.id);
                continue;
            }

            // sequential by design — phases run in dependency order
            // eslint-disable-next-line no-await-in-loop
            const phaseRun = await this._runPhase(input, run.id, phase);
            phaseRuns.push(phaseRun);
            finalState.set(phase.id, phaseRun.state);

            const critical = phase.optional === false;

            if (critical && phaseRun.state === CycleState.Failed) {
                criticalFailed = true;

                if (phase.rollback !== undefined) {
                    // sequential by design — rollback follows the failed phase
                    // eslint-disable-next-line no-await-in-loop
                    phaseRuns.push(await this._runRollback(input, run.id, phase, phase.rollback));
                }
            }

            if (critical && phaseRun.state === CycleState.ManualReleaseRequired) {
                paused = true;
            }
        }

        const entries = WorkflowEngine._entries(input.workflow.phases, finalState, skipped);
        return {run: run, phaseRuns: phaseRuns, state: WorkflowStateResolver.resolve(entries), diagnostics: diagnostics};
    }

    /**
     * Run one phase and build its PhaseRun.
     * @param {WorkflowRunInput} input - The run input.
     * @param {string} runId - The workflow run id.
     * @param {WorkflowPhase} phase - The phase to run.
     * @returns {Promise<PhaseRun>} The recorded phase run.
     */
    protected async _runPhase(input: WorkflowRunInput, runId: string, phase: WorkflowPhase): Promise<PhaseRun> {
        return this._executePhase(input, runId, phase.id, phase.root);
    }

    /**
     * Run a phase's rollback root.
     * @param {WorkflowRunInput} input - The run input.
     * @param {string} runId - The workflow run id.
     * @param {WorkflowPhase} phase - The failed phase.
     * @param {PhaseRoot} rollback - The rollback root.
     * @returns {Promise<PhaseRun>} The recorded rollback phase run.
     */
    protected async _runRollback(input: WorkflowRunInput, runId: string, phase: WorkflowPhase, rollback: PhaseRoot): Promise<PhaseRun> {
        return this._executePhase(input, runId, `${phase.id}:rollback`, rollback);
    }

    /**
     * Execute a root as a cycle and record a PhaseRun.
     * @param {WorkflowRunInput} input - The run input.
     * @param {string} runId - The workflow run id.
     * @param {string} phaseId - The phase id to record under.
     * @param {PhaseRoot} root - The root to execute.
     * @returns {Promise<PhaseRun>} The recorded phase run.
     */
    protected async _executePhase(input: WorkflowRunInput, runId: string, phaseId: string, root: PhaseRoot): Promise<PhaseRun> {
        const startedAt = this._clock.now();
        const outcome = await this._executor.run({project: input.project, target: input.target, root: root});
        const state = outcome.cycle === undefined ? CycleState.Failed : outcome.cycle.cycle.state;

        const phaseRun: PhaseRun = {
            id: this._idGenerator.next('prun'),
            workflowRunId: runId,
            phaseId: phaseId,
            state: state,
            cycleId: outcome.cycle?.cycle.id,
            planId: outcome.plan.id,
            startedAt: startedAt,
            endedAt: this._clock.now()
        };

        if (this._store !== undefined) {
            await this._store.appendRecord('phaseRun', PhaseRunSchema, phaseRun);
        }

        return phaseRun;
    }

    /**
     * Whether a phase should run now.
     * @param {WorkflowPhase} phase - The phase.
     * @param {boolean} criticalFailed - Whether a critical phase has failed.
     * @param {Map<string, CycleState|undefined>} finalState - States of completed phases.
     * @returns {boolean} True when the phase should execute.
     */
    protected static _shouldRun(phase: WorkflowPhase, criticalFailed: boolean, finalState: Map<string, CycleState|undefined>): boolean {
        if (phase.runOn === WorkflowPhaseRunOn.OnPriorFailure) {
            return criticalFailed;
        }

        if (criticalFailed) {
            return false;
        }

        return phase.dependsOn.every((dependencyId): boolean => PASSING.has(finalState.get(dependencyId) ?? CycleState.Running));
    }

    /**
     * Build resolver entries from phase dispositions.
     * @param {WorkflowPhase[]} phases - The workflow phases.
     * @param {Map<string, CycleState|undefined>} finalState - States of run phases.
     * @param {Set<string>} skipped - Skipped phase ids.
     * @returns {PhaseStatusEntry[]} One entry per phase.
     */
    protected static _entries(phases: WorkflowPhase[], finalState: Map<string, CycleState|undefined>, skipped: Set<string>): PhaseStatusEntry[] {
        return phases.map((phase): PhaseStatusEntry => {
            return {optional: phase.optional, state: finalState.get(phase.id), skipped: skipped.has(phase.id)};
        });
    }

    /**
     * Dependency-first order of phases (deterministic).
     * @param {WorkflowPhase[]} phases - The phases.
     * @returns {WorkflowPhase[]} Phases ordered so dependencies come first.
     */
    protected static _order(phases: WorkflowPhase[]): WorkflowPhase[] {
        const byId = new Map(phases.map((phase): [string, WorkflowPhase] => [phase.id, phase]));
        const result: WorkflowPhase[] = [];
        const visited = new Set<string>();

        for (const phase of phases) {
            WorkflowEngine._visit(phase, byId, visited, result);
        }

        return result;
    }

    /**
     * Post-order visit for topological ordering.
     * @param {WorkflowPhase} phase - The phase.
     * @param {Map<string, WorkflowPhase>} byId - Lookup of phases by id.
     * @param {Set<string>} visited - Visited ids.
     * @param {WorkflowPhase[]} result - Accumulated order.
     * @returns {void}
     */
    protected static _visit(phase: WorkflowPhase, byId: Map<string, WorkflowPhase>, visited: Set<string>, result: WorkflowPhase[]): void {
        if (visited.has(phase.id)) {
            return;
        }

        visited.add(phase.id);

        for (const dependencyId of phase.dependsOn) {
            const dependency = byId.get(dependencyId);

            if (dependency !== undefined) {
                WorkflowEngine._visit(dependency, byId, visited, result);
            }
        }

        result.push(phase);
    }

    /**
     * Dependency ids of a phase (for cycle detection).
     * @param {string} id - The phase id.
     * @param {Workflow} workflow - The workflow.
     * @returns {string[]} The phase's dependency ids.
     */
    protected static _dependsOn(id: string, workflow: Workflow): string[] {
        return workflow.phases.find((phase): boolean => phase.id === id)?.dependsOn ?? [];
    }

}