/**
 * ManualAdapter — a manual confirmation step.
 *
 * An unanswered manual step yields confirmed = undefined, which the evaluator
 * maps to "unknown" (never silently passed). A seeded confirmation (true/false)
 * is used for replay and testing.
 *
 * The instruction text may be localized: `prompt` is the default (English per
 * the language policy), `prompts` maps a language code to a translation. The
 * language is display-only — it never changes the outcome of the step.
 */
import {Vts} from 'vts';
import {CheckAction} from '../Domain/Check.js';
import {AdapterKind} from '../Domain/Common.js';
import {Adapter} from './Adapter.js';
import {AdapterOutcome} from './AdapterTypes.js';

/**
 * Schema of the manual adapter's params.
 */
export const ManualParamsSchema = Vts.object({
    prompt: Vts.optional(Vts.string({description: 'Default instruction text (fallback)'})),
    prompts: Vts.optional(Vts.object2(
        Vts.string({description: 'Language code, e.g. de'}),
        Vts.string({description: 'Localized instruction text'})
    )),
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
     * Select the instruction text to show for a manual step (display-only).
     * Order: prompts[lang] → prompt → description. Empty strings are skipped;
     * params that do not match the schema fall back to the description.
     * @param {unknown} params - The manual action's params.
     * @param {string} description - The check description (last fallback).
     * @param {string} [lang] - The requested language code, e.g. de.
     * @returns {string} The text to show the operator.
     */
    public static selectPrompt(params: unknown, description: string, lang?: string): string {
        const typed: unknown = params ?? {};

        if (!ManualParamsSchema.validate(typed, [])) {
            return description;
        }

        const localized = lang === undefined ? undefined : typed.prompts?.[lang];

        if (localized !== undefined && localized.length > 0) {
            return localized;
        }

        if (typed.prompt !== undefined && typed.prompt.length > 0) {
            return typed.prompt;
        }

        return description;
    }

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