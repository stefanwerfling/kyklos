/**
 * DryRunner — runs a playbook/procedure/checklist from a store as a simulated
 * cycle.
 *
 * It wires the unchanged chain — a dry-run registry under a CheckRunner, a
 * CycleEngine, and the PlanExecutor over a StoreDefinitionSource — so a root is
 * resolved, compiled and executed end to end without touching a real system.
 * The result is the ordinary PlanRunResult (plan + cycle), so the caller can
 * read the compiled checks, the cycle state, and apply the ReleaseGate exactly
 * as for a real run. The safety gate before anything goes live.
 */
import {Clock} from '../Cycle/Clock.js';
import {CycleEngine} from '../Cycle/CycleEngine.js';
import {IdGenerator} from '../Cycle/IdGenerator.js';
import {Project} from '../Domain/Project.js';
import {TargetSystem} from '../Domain/TargetSystem.js';
import {CheckRunner} from '../Runner/CheckRunner.js';
import {DryRunRegistry} from '../Runner/DryRunRegistry.js';
import {DryRunResolver} from '../Runner/DryRunAdapter.js';
import {FileStore} from '../Store/FileStore.js';
import {PlanExecutor, PlanRunResult} from './PlanExecutor.js';
import {RootRef} from './PlaybookResolver.js';
import {StoreDefinitionSource} from './StoreDefinitionSource.js';

/**
 * Collaborators the dry runner depends on.
 */
export interface DryRunnerOptions {
    store: FileStore;
    idGenerator: IdGenerator;
    clock: Clock;
    resolver?: DryRunResolver;
}

/**
 * Input of a dry run.
 */
export interface DryRunInput {
    project: Project;
    target: TargetSystem;
    root: RootRef;
}

/**
 * Runs playbooks from a store with every adapter simulated.
 */
export class DryRunner {

    /**
     * The executor configured for dry runs.
     * @member {PlanExecutor}
     */
    protected readonly _executor: PlanExecutor;

    /**
     * @param {DryRunnerOptions} options - Store, injected collaborators and an optional resolver.
     */
    public constructor(options: DryRunnerOptions) {
        const runner = new CheckRunner(DryRunRegistry.all(options.resolver));
        const engine = new CycleEngine({runner: runner, idGenerator: options.idGenerator, clock: options.clock, store: options.store});
        this._executor = new PlanExecutor({engine: engine, source: new StoreDefinitionSource(options.store), idGenerator: options.idGenerator, clock: options.clock, store: options.store});
    }

    /**
     * Resolve, compile and run a root as a simulated cycle.
     * @param {DryRunInput} input - Project, target and the root to run.
     * @returns {Promise<PlanRunResult>} The execution plan and the simulated cycle.
     */
    public async run(input: DryRunInput): Promise<PlanRunResult> {
        return this._executor.run({project: input.project, target: input.target, root: input.root});
    }

}