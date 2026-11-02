/**
 * WorkflowStateResolver — derives the overall workflow state from its phases.
 *
 * Deterministic and mirroring CycleStateResolver, so the gate semantics are the
 * same at both levels. A critical (non-optional) phase that failed yields
 * failed; a critical phase awaiting a manual release yields
 * manual_release_required (paused). An expected-but-unrun phase keeps the run
 * running. Optional failures and deviations yield passed_with_deviations. A
 * skipped phase is neutral. The engine decides run/skip/pending per phase; this
 * resolver only aggregates — no second status logic.
 */
import {CycleState} from '../Domain/Common.js';

/**
 * One phase's disposition for aggregation.
 */
export interface PhaseStatusEntry {

    /**
     * Whether the phase is optional (a failed optional phase does not block).
     * @member {boolean}
     */
    optional: boolean;

    /**
     * The phase's terminal state, or undefined when it has not run yet.
     * @member {CycleState|undefined}
     */
    state?: CycleState;

    /**
     * True when the phase was deliberately skipped (neutral).
     * @member {boolean|undefined}
     */
    skipped?: boolean;
}

/**
 * Static resolver of the overall workflow state.
 */
export class WorkflowStateResolver {

    /**
     * Derive the workflow state from its phase dispositions.
     * @param {PhaseStatusEntry[]} entries - One entry per phase.
     * @returns {CycleState} The derived workflow state.
     */
    public static resolve(entries: PhaseStatusEntry[]): CycleState {
        const active = entries.filter((entry): boolean => entry.skipped !== true);

        if (active.some((entry): boolean => entry.optional === false && entry.state === CycleState.Failed)) {
            return CycleState.Failed;
        }

        if (active.some((entry): boolean => entry.optional === false && entry.state === CycleState.ManualReleaseRequired)) {
            return CycleState.ManualReleaseRequired;
        }

        if (active.some((entry): boolean => entry.state === undefined)) {
            return CycleState.Running;
        }

        if (active.some((entry): boolean => WorkflowStateResolver._isDeviation(entry))) {
            return CycleState.PassedWithDeviations;
        }

        return CycleState.Passed;
    }

    /**
     * Whether a (run) phase counts as a non-blocking deviation.
     * @param {PhaseStatusEntry} entry - The phase entry.
     * @returns {boolean} True on an optional failure/manual or a with-deviations pass.
     */
    protected static _isDeviation(entry: PhaseStatusEntry): boolean {
        if (entry.state === CycleState.PassedWithDeviations) {
            return true;
        }

        return entry.optional && (entry.state === CycleState.Failed || entry.state === CycleState.ManualReleaseRequired);
    }

}