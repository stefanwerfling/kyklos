/**
 * CycleStateResolver — the gatekeeping core.
 *
 * Deterministically derives the terminal cycle state from the per-check
 * statuses and their criticality. The central safety rule: a critical check
 * that is skipped, not executable or unknown never yields a passing state — it
 * forces manual_release_required. A critical failed check yields failed.
 */
import {CheckStatus, Criticality, CycleState} from '../Domain/Common.js';

/**
 * A single check's status together with its criticality.
 */
export interface CheckStatusEntry {

    /**
     * The resulting check status.
     * @member {CheckStatus}
     */
    status: CheckStatus;

    /**
     * The check's criticality.
     * @member {Criticality}
     */
    criticality: Criticality;
}

const GATE_STATUSES = new Set<CheckStatus>([CheckStatus.Skipped, CheckStatus.NotExecutable, CheckStatus.Unknown]);
const DEVIATION_STATUSES = new Set<CheckStatus>([CheckStatus.Failed, CheckStatus.Skipped, CheckStatus.NotExecutable, CheckStatus.Unknown]);

/**
 * Static resolver of the terminal cycle state.
 */
export class CycleStateResolver {

    /**
     * Derive the terminal cycle state from the per-check results.
     * @param {CheckStatusEntry[]} entries - Status and criticality per check.
     * @returns {CycleState} The derived terminal state.
     */
    public static resolve(entries: CheckStatusEntry[]): CycleState {
        const criticals = entries.filter((entry): boolean => entry.criticality === Criticality.Critical);

        if (criticals.some((entry): boolean => entry.status === CheckStatus.Failed)) {
            return CycleState.Failed;
        }

        if (criticals.some((entry): boolean => GATE_STATUSES.has(entry.status))) {
            return CycleState.ManualReleaseRequired;
        }

        const others = entries.filter((entry): boolean => entry.criticality !== Criticality.Critical);

        if (others.some((entry): boolean => DEVIATION_STATUSES.has(entry.status))) {
            return CycleState.PassedWithDeviations;
        }

        return CycleState.Passed;
    }

}