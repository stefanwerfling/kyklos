/**
 * DryRunAdapter — simulates an action without touching any real system.
 *
 * It returns a configurable outcome (default: a generic success), so a whole
 * checklist can be exercised end to end for planning, demos and tests. A real
 * run swaps in the ShellAdapter / HttpAdapter / ManualAdapter under the same
 * adapter kinds.
 */
import {CheckAction} from '../Domain/Check.js';
import {AdapterKind} from '../Domain/Common.js';
import {Adapter} from './Adapter.js';
import {AdapterOutcome} from './AdapterTypes.js';

/**
 * Maps an action to a simulated outcome.
 */
export type DryRunResolver = (action: CheckAction) => AdapterOutcome;

/**
 * Adapter that simulates execution for dry runs.
 */
export class DryRunAdapter extends Adapter {

    /**
     * The adapter kind this executor stands in for.
     * @member {AdapterKind}
     */
    public readonly kind: AdapterKind;

    /**
     * Resolver that produces the simulated outcome.
     * @member {DryRunResolver}
     */
    protected readonly _resolver: DryRunResolver;

    /**
     * @param {AdapterKind} kind - The adapter kind this instance stands in for.
     * @param {DryRunResolver} [resolver] - Optional outcome resolver; defaults to a generic success.
     */
    public constructor(kind: AdapterKind, resolver?: DryRunResolver) {
        super();
        this.kind = kind;
        this._resolver = resolver ?? ((): AdapterOutcome => {
            return {executed: true, exitCode: 0, stdout: '', httpStatus: 200, confirmed: true};
        });
    }

    /**
     * Return the simulated outcome for an action.
     * @param {CheckAction} action - The action to simulate.
     * @returns {Promise<AdapterOutcome>} The simulated outcome.
     */
    public async execute(action: CheckAction): Promise<AdapterOutcome> {
        return this._resolver(action);
    }

}