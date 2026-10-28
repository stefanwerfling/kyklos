/**
 * CheckRunner — runs a single check deterministically and maps it to one of
 * the six check statuses.
 *
 * Mapping: skip -> skipped; not applicable -> not_applicable; missing adapter
 * or non-executed action -> not_executable; otherwise the success criterion
 * decides passed / failed / unknown. A non-executed critical check therefore
 * never becomes passed — the cycle engine (M3) turns that into a gate.
 */
import {Check} from '../Domain/Check.js';
import {CheckStatus} from '../Domain/Common.js';
import {AdapterRegistry} from './AdapterRegistry.js';
import {CheckRunResult, RunOptions} from './AdapterTypes.js';
import {SuccessCriterionEvaluator} from './SuccessCriterionEvaluator.js';

/**
 * Orchestrates adapter execution and criterion evaluation for one check.
 */
export class CheckRunner {

    /**
     * Registry used to resolve the action's adapter.
     * @member {AdapterRegistry}
     */
    protected readonly _registry: AdapterRegistry;

    /**
     * @param {AdapterRegistry} registry - Registry of available adapters.
     */
    public constructor(registry: AdapterRegistry) {
        this._registry = registry;
    }

    /**
     * Run one check and return its deterministic result.
     * @param {Check} check - The check to run.
     * @param {RunOptions} [options] - Skip / applicability controls.
     * @returns {Promise<CheckRunResult>} The status, reason and raw outcome.
     */
    public async run(check: Check, options?: RunOptions): Promise<CheckRunResult> {
        if (options?.skip === true) {
            return {status: CheckStatus.Skipped, reason: 'skipped'};
        }

        if (options?.applicable === false) {
            return {status: CheckStatus.NotApplicable, reason: 'preconditions_not_applicable'};
        }

        const adapter = this._registry.get(check.action.adapter);

        if (adapter === undefined) {
            return {status: CheckStatus.NotExecutable, reason: `no_adapter: ${check.action.adapter}`};
        }

        const outcome = await adapter.execute(check.action);

        if (!outcome.executed) {
            return {status: CheckStatus.NotExecutable, reason: outcome.reason ?? 'not_executable', outcome: outcome};
        }

        const evaluation = SuccessCriterionEvaluator.evaluate(check.successCriterion, outcome);
        return {status: evaluation.status, reason: evaluation.reason, outcome: outcome};
    }

}