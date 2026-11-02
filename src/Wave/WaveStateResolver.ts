/**
 * WaveStateResolver — derives wave and rollout state from environment results.
 *
 * Deterministic and pure, so the gate reads the same whether it is computed
 * live by the WaveController or rebuilt from stored records by the report. A
 * wave passes only when every environment passed (or passed with deviations);
 * the rollout fails if any wave failed, is blocked if any wave was blocked
 * (a later wave that never ran because an earlier one failed), else passes.
 */
import {CycleState, WaveState} from '../Domain/Common.js';

const PASSING = new Set<CycleState>([CycleState.Passed, CycleState.PassedWithDeviations]);

/**
 * Static resolver of wave and rollout state.
 */
export class WaveStateResolver {

    /**
     * Resolve one wave's state from its environment states.
     * @param {CycleState[]} environmentStates - The state of each environment in the wave.
     * @returns {WaveState} Passed when every environment passed, else Failed.
     */
    public static resolveWave(environmentStates: CycleState[]): WaveState {
        return environmentStates.every((state): boolean => PASSING.has(state)) ? WaveState.Passed : WaveState.Failed;
    }

    /**
     * Resolve the overall rollout state from the per-wave states.
     * @param {WaveState[]} waveStates - The state of each wave.
     * @returns {WaveState} Failed if any failed, Blocked if any blocked, else Passed.
     */
    public static resolveOverall(waveStates: WaveState[]): WaveState {
        if (waveStates.some((state): boolean => state === WaveState.Failed)) {
            return WaveState.Failed;
        }

        if (waveStates.some((state): boolean => state === WaveState.Blocked)) {
            return WaveState.Blocked;
        }

        return WaveState.Passed;
    }

}