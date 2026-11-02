/**
 * DryRunRegistry — an AdapterRegistry that simulates every adapter kind.
 *
 * It registers a DryRunAdapter for each AdapterKind so any checklist can run end
 * to end without touching a real system. The default resolver simulates a
 * successful command with non-empty output, so the common success criteria
 * (exitZero, nonEmpty, httpStatus, manualConfirm) all pass — a clean dry run
 * exercises the whole order and gating, not a half-empty stand-in. Pass a custom
 * resolver to simulate failures or partial outcomes.
 */
import {AdapterKind} from '../Domain/Common.js';
import {AdapterOutcome} from './AdapterTypes.js';
import {AdapterRegistry} from './AdapterRegistry.js';
import {DryRunAdapter, DryRunResolver} from './DryRunAdapter.js';

/**
 * Builder of a fully-simulated adapter registry for dry runs.
 */
export class DryRunRegistry {

    /**
     * The default dry-run outcome: a successful command with non-empty output.
     * @returns {AdapterOutcome} A simulated success.
     */
    public static successOutcome(): AdapterOutcome {
        return {executed: true, exitCode: 0, stdout: 'dry-run ok', httpStatus: 200, confirmed: true};
    }

    /**
     * Build a registry with a DryRunAdapter for every adapter kind.
     * @param {DryRunResolver} [resolver] - Optional outcome resolver; defaults to a success with output.
     * @returns {AdapterRegistry} A registry that simulates every kind.
     */
    public static all(resolver?: DryRunResolver): AdapterRegistry {
        const effective = resolver ?? ((): AdapterOutcome => DryRunRegistry.successOutcome());
        const registry = new AdapterRegistry();

        for (const kind of Object.values(AdapterKind)) {
            registry.register(new DryRunAdapter(kind, effective));
        }

        return registry;
    }

}