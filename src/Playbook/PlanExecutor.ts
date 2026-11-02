/**
 * PlanExecutor — resolves and compiles a playbook/procedure root, records an
 * ExecutionPlan, and runs it on the unchanged CycleEngine.
 *
 * This is the only glue between the playbook layer and the existing execution
 * core. It synthesizes a Procedure + Checklist from the compiled checks and
 * hands them to CycleEngine.run exactly as a hand-written checklist would be —
 * no engine change, no second status logic. If resolution or compilation is not
 * ok, it records the plan with its diagnostics and does not execute. The plan
 * links back to the cycle via cycleId, so audit can answer which playbook,
 * version and sources produced each check.
 */
import {Check} from '../Domain/Check.js';
import {Checklist} from '../Domain/Checklist.js';
import {ExecutionPlan, ExecutionPlanSchema} from '../Domain/ExecutionPlan.js';
import {Procedure} from '../Domain/Procedure.js';
import {Project} from '../Domain/Project.js';
import {TargetSystem} from '../Domain/TargetSystem.js';
import {Clock} from '../Cycle/Clock.js';
import {CycleEngine, CycleRunResult} from '../Cycle/CycleEngine.js';
import {IdGenerator} from '../Cycle/IdGenerator.js';
import {RunOptions} from '../Runner/AdapterTypes.js';
import {FileStore} from '../Store/FileStore.js';
import {DefinitionSource, PlaybookCompiler} from './PlaybookCompiler.js';
import {PlaybookResolver, RootRef} from './PlaybookResolver.js';

const SYNTHETIC_RULE_VERSION = '1.0.0';

/**
 * Collaborators the plan executor depends on.
 */
export interface PlanExecutorOptions {
    engine: CycleEngine;
    source: DefinitionSource;
    idGenerator: IdGenerator;
    clock: Clock;
    store?: FileStore;
}

/**
 * Input of a plan run.
 */
export interface PlanRunInput {
    project: Project;
    target: TargetSystem;
    root: RootRef;
    runOptions?: Record<string, RunOptions>;
    confirmations?: Record<string, boolean>;
    confirm?: (check: Check) => Promise<boolean>;
}

/**
 * The outcome of a plan run.
 */
export interface PlanRunResult {
    plan: ExecutionPlan;
    cycle?: CycleRunResult;
}

/**
 * Resolves, compiles and executes playbook/procedure roots.
 */
export class PlanExecutor {

    /**
     * The unchanged execution engine.
     * @member {CycleEngine}
     */
    protected readonly _engine: CycleEngine;

    /**
     * Definition source for resolution and compilation.
     * @member {DefinitionSource}
     */
    protected readonly _source: DefinitionSource;

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
     * Optional store to persist the ExecutionPlan.
     * @member {FileStore|undefined}
     */
    protected readonly _store: FileStore|undefined;

    /**
     * @param {PlanExecutorOptions} options - Engine, source and injected collaborators.
     */
    public constructor(options: PlanExecutorOptions) {
        this._engine = options.engine;
        this._source = options.source;
        this._idGenerator = options.idGenerator;
        this._clock = options.clock;
        this._store = options.store;
    }

    /**
     * Resolve, compile, record and (if ok) run a root.
     * @param {PlanRunInput} input - Project, target, root and per-check options.
     * @returns {Promise<PlanRunResult>} The ExecutionPlan and the cycle result (if executed).
     */
    public async run(input: PlanRunInput): Promise<PlanRunResult> {
        const resolution = await PlaybookResolver.resolve({projectId: input.project.id, target: input.target, root: input.root}, this._source);
        const compilation = await PlaybookCompiler.compile(input.root, this._source);
        const diagnostics = [...resolution.diagnostics, ...compilation.diagnostics];
        const runnable = resolution.ok && compilation.ok;

        let cycle: CycleRunResult|undefined;

        if (runnable) {
            cycle = await this._engine.run({project: input.project, procedure: PlanExecutor._procedure(input.root), checklist: PlanExecutor._checklist(input.root, compilation.compiledChecks), runOptions: input.runOptions, confirmations: input.confirmations, confirm: input.confirm});
        }

        const plan: ExecutionPlan = {
            id: this._idGenerator.next('plan'),
            createdAt: this._clock.now(),
            projectId: input.project.id,
            rootKind: input.root.kind,
            rootId: input.root.id,
            rootVersion: input.root.version,
            targetSystemId: input.target.id,
            resolved: resolution.resolved,
            checkProvenance: compilation.checkProvenance,
            compiledChecks: compilation.compiledChecks,
            diagnostics: diagnostics,
            cycleId: cycle?.cycle.id
        };

        if (this._store !== undefined) {
            await this._store.appendRecord('executionPlan', ExecutionPlanSchema, plan);
        }

        return {plan: plan, cycle: cycle};
    }

    /**
     * Synthesize the Procedure the engine records for a compiled root.
     * @param {RootRef} root - The root reference.
     * @returns {Procedure} A procedure whose id/version are the root's.
     */
    protected static _procedure(root: RootRef): Procedure {
        return {
            id: root.id,
            version: root.version,
            name: `Compiled ${root.kind} ${root.id}`,
            kind: root.kind,
            checklistId: root.id,
            checklistVersion: root.version
        };
    }

    /**
     * Synthesize the Checklist the engine runs from the compiled checks.
     * @param {RootRef} root - The root reference.
     * @param {Checklist['checks']} checks - The compiled checks.
     * @returns {Checklist} The synthesized checklist.
     */
    protected static _checklist(root: RootRef, checks: Checklist['checks']): Checklist {
        return {
            id: root.id,
            version: root.version,
            ruleVersion: SYNTHETIC_RULE_VERSION,
            checks: checks
        };
    }

}