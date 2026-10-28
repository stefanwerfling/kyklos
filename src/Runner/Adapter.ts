/**
 * Adapter — abstract base for check-action executors.
 *
 * An adapter turns a CheckAction into a raw AdapterOutcome. It must never
 * throw for an expected failure (timeout, not allow-listed, network error);
 * those map to an outcome with executed = false and a reason.
 */
import {CheckAction} from '../Domain/Check.js';
import {AdapterKind} from '../Domain/Common.js';
import {AdapterOutcome} from './AdapterTypes.js';

/**
 * Abstract executor for a single adapter kind.
 */
export abstract class Adapter {

    /**
     * The adapter kind this executor handles.
     * @member {AdapterKind}
     */
    public abstract readonly kind: AdapterKind;

    /**
     * Execute a check action and return its raw outcome.
     * @param {CheckAction} action - The action to execute.
     * @returns {Promise<AdapterOutcome>} The raw outcome (never rejects on expected failure).
     */
    public abstract execute(action: CheckAction): Promise<AdapterOutcome>;

}