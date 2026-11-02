/**
 * LlmAdvisor — the only boundary through which an LLM may influence a cycle.
 *
 * An advisor returns suggestions, plans and diagnoses — text, never results. It
 * cannot produce an Observation, set a status, or change a release decision.
 * The core runs fully without one (see NullLlmAdvisor), satisfying the
 * "deterministic core works with no LLM" rule.
 */
import {PlanCandidate} from '../Planning/PlanCandidate.js';

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

    /**
     * Propose a whole plan (playbook/workflow) for a goal. The result is a draft
     * candidate as data — never persisted, runnable, or binding by itself.
     * @param {string} goal - The goal the plan should achieve.
     * @param {AdvisorContext} context - The current context.
     * @returns {Promise<PlanCandidate|undefined>} A draft candidate, or undefined when none is offered.
     */
    proposePlan(goal: string, context: AdvisorContext): Promise<PlanCandidate|undefined>;
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

    /**
     * @returns {Promise<PlanCandidate|undefined>} Always undefined — no LLM.
     */
    public async proposePlan(): Promise<PlanCandidate|undefined> {
        return undefined;
    }

}