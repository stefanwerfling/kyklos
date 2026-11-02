/**
 * RealRunner — runs a playbook from a store against the real system.
 *
 * Like DryRunner, but with real adapters: an allow-listed ShellAdapter and a
 * ManualAdapter, each wrapped in an EnvResolvingAdapter so ${VAR} placeholders
 * are substituted from a project .env at execution time. Security stays
 * fail-closed: only allow-listed binaries run, an unresolved variable is not
 * executable, and a manual check with no confirmation does not pass — so a run
 * naturally executes the automatable checks and halts at the first step that
 * needs a human. The deterministic core is unchanged; this only composes it.
 */
import {Clock} from '../Cycle/Clock.js';
import {CycleEngine} from '../Cycle/CycleEngine.js';
import {IdGenerator} from '../Cycle/IdGenerator.js';
import {Project} from '../Domain/Project.js';
import {TargetSystem} from '../Domain/TargetSystem.js';
import {AdapterRegistry} from '../Runner/AdapterRegistry.js';
import {CheckRunner} from '../Runner/CheckRunner.js';
import {EnvResolvingAdapter} from '../Runner/EnvResolvingAdapter.js';
import {ManualAdapter} from '../Runner/ManualAdapter.js';
import {ShellAdapter} from '../Runner/ShellAdapter.js';
import {FileStore} from '../Store/FileStore.js';
import {PlanExecutor, PlanRunResult} from './PlanExecutor.js';
import {RootRef} from './PlaybookResolver.js';
import {StoreDefinitionSource} from './StoreDefinitionSource.js';

const DEFAULT_TIMEOUT_MS = 1800000;

/**
 * Collaborators the real runner depends on.
 */
export interface RealRunnerOptions {
    store: FileStore;
    idGenerator: IdGenerator;
    clock: Clock;
    env: Record<string, string>;
    allowlist: string[];
    defaultTimeoutMs?: number;
}

/**
 * Input of a real run.
 */
export interface RealRunInput {
    project: Project;
    target: TargetSystem;
    root: RootRef;
}

/**
 * Runs playbooks from a store against the real system, with ${VAR} resolution.
 */
export class RealRunner {

    /**
     * The executor configured with real, env-resolving adapters.
     * @member {PlanExecutor}
     */
    protected readonly _executor: PlanExecutor;

    /**
     * @param {RealRunnerOptions} options - Store, collaborators, env values and the shell allow-list.
     */
    public constructor(options: RealRunnerOptions) {
        const shell = new ShellAdapter({allowlist: options.allowlist, defaultTimeoutMs: options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS});
        const registry = new AdapterRegistry()
        .register(new EnvResolvingAdapter(shell, options.env))
        .register(new EnvResolvingAdapter(new ManualAdapter(), options.env));
        const engine = new CycleEngine({runner: new CheckRunner(registry), idGenerator: options.idGenerator, clock: options.clock, store: options.store});
        this._executor = new PlanExecutor({engine: engine, source: new StoreDefinitionSource(options.store), idGenerator: options.idGenerator, clock: options.clock, store: options.store});
    }

    /**
     * Resolve, compile and run a root against the real system.
     * @param {RealRunInput} input - Project, target and the root to run.
     * @returns {Promise<PlanRunResult>} The execution plan and the cycle.
     */
    public async run(input: RealRunInput): Promise<PlanRunResult> {
        return this._executor.run({project: input.project, target: input.target, root: input.root});
    }

}