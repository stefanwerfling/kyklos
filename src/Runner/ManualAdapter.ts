/**
 * ManualAdapter — a manual confirmation step.
 *
 * An unanswered manual step yields confirmed = undefined, which the evaluator
 * maps to "unknown" (never silently passed). A seeded confirmation (true/false)
 * is used for replay and testing.
 */
import {Vts} from 'vts';
import {CheckAction} from '../Domain/Check.js';
import {AdapterKind} from '../Domain/Common.js';
import {Adapter} from './Adapter.js';
import {AdapterOutcome} from './AdapterTypes.js';

const ManualParamsSchema = Vts.object({
    prompt: Vts.optional(Vts.string()),
    confirmed: Vts.optional(Vts.boolean())
}, {objectSchema: {strict: true}});

/**
 * Adapter for manual confirmation steps.
 */
export class ManualAdapter extends Adapter {

    /**
     * The adapter kind this executor handles.
     * @member {AdapterKind}
     */
    public readonly kind: AdapterKind = AdapterKind.Manual;

    /**
     * Execute a manual action.
     * @param {CheckAction} action - The manual action; params may carry a seeded confirmation.
     * @returns {Promise<AdapterOutcome>} Outcome with the confirmation value, if any.
     */
    public async execute(action: CheckAction): Promise<AdapterOutcome> {
        const params = action.params ?? {};

        if (!ManualParamsSchema.validate(params, [])) {
            return Promise.resolve({executed: false, reason: 'invalid_params'});
        }

        return Promise.resolve({executed: true, confirmed: params.confirmed});
    }

}