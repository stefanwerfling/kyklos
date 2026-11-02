/**
 * PreconditionEvaluator — decides whether a check's preconditions are satisfied.
 *
 * A precondition is a string `<checkId>==<status>`; it holds when an earlier
 * check in the same cycle reached exactly that status. Evaluation is
 * fail-closed: an unparseable precondition, an unknown status, or a referent
 * that has not run (or reached a different status) means NOT satisfied — so a
 * check never runs its action on an unmet or ambiguous precondition. This is
 * what turns the declarative `preconditions` field into real execution gating.
 */
import {CheckStatus} from '../Domain/Common.js';

const STATUSES = new Set<string>(Object.values(CheckStatus));

/**
 * Static evaluator of check preconditions against prior results.
 */
export class PreconditionEvaluator {

    /**
     * Whether every precondition holds given the statuses reached so far.
     * @param {string[]} preconditions - The check's preconditions (`id==status`).
     * @param {Map<string, CheckStatus>} results - Statuses of checks already run, by id.
     * @returns {boolean} True only when all preconditions are satisfied (empty = true).
     */
    public static satisfied(preconditions: string[], results: Map<string, CheckStatus>): boolean {
        return preconditions.every((precondition): boolean => PreconditionEvaluator._holds(precondition, results));
    }

    /**
     * Whether a single precondition holds.
     * @param {string} precondition - A `id==status` expression.
     * @param {Map<string, CheckStatus>} results - Statuses of checks already run.
     * @returns {boolean} True only on a parseable, matched precondition.
     */
    protected static _holds(precondition: string, results: Map<string, CheckStatus>): boolean {
        const parts = precondition.split('==');

        if (parts.length !== 2) {
            return false;
        }

        const id = parts[0].trim();
        const expected = parts[1].trim();

        if (id.length === 0 || !STATUSES.has(expected)) {
            return false;
        }

        return results.get(id) === expected;
    }

}