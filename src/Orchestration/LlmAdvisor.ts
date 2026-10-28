/**
 * LlmAdvisor — the only boundary through which an LLM may influence a cycle.
 *
 * An advisor returns suggestions, plans and diagnoses — text, never results. It
 * cannot produce an Observation, set a status, or change a release decision.
 * The core runs fully without one (see NullLlmAdvisor), satisfying the
 * "deterministic core works with no LLM" rule.
 */

/**
 * Context handed to the advisor for suggestions.
 */
export interface AdvisorContext {

    /**
     * Project name.
     * @member {string}
     */
    projectName: string;

    /**
     * Ids of the checks in the current plan.
     * @member {string[]}
     */
    checkIds: string[];
}

/**
 * An advisory LLM boundary. Suggestions only; never authoritative.
 */
export interface LlmAdvisor {

    /**
     * Suggest additional checks worth running.
     * @param {AdvisorContext} context - The current context.
     * @returns {Promise<string[]>} Suggested check descriptions (advisory only).
     */
    suggestChecks(context: AdvisorContext): Promise<string[]>;

    /**
     * Offer a diagnosis for an incident signature.
     * @param {string} signature - The incident signature.
     * @returns {Promise<string>} A free-text diagnosis (advisory only).
     */
    diagnose(signature: string): Promise<string>;
}

/**
 * The default no-op advisor, so the core runs with no LLM.
 */
export class NullLlmAdvisor implements LlmAdvisor {

    /**
     * @returns {Promise<string[]>} Always empty.
     */
    public async suggestChecks(): Promise<string[]> {
        return [];
    }

    /**
     * @returns {Promise<string>} Always empty.
     */
    public async diagnose(): Promise<string> {
        return '';
    }

}