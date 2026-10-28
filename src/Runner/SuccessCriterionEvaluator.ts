/**
 * SuccessCriterionEvaluator — deterministically maps an outcome to a status.
 *
 * Returns only passed / failed / unknown. "not_executable", "skipped" and
 * "not_applicable" are decided by the runner, not here.
 */
import {Vts} from 'vts';
import {SuccessCriterion} from '../Domain/Check.js';
import {CheckStatus} from '../Domain/Common.js';
import {AdapterOutcome, EvaluationResult} from './AdapterTypes.js';

const RegexParamsSchema = Vts.object({
    pattern: Vts.string(),
    flags: Vts.optional(Vts.string())
}, {objectSchema: {strict: true}});

const HttpStatusParamsSchema = Vts.object({
    equals: Vts.number()
}, {objectSchema: {strict: true}});

/**
 * Static evaluator of success criteria.
 */
export class SuccessCriterionEvaluator {

    /**
     * Evaluate a criterion against an outcome.
     * @param {SuccessCriterion} criterion - The criterion to apply.
     * @param {AdapterOutcome} outcome - The raw outcome of the executed action.
     * @returns {EvaluationResult} The resulting status and reason.
     */
    public static evaluate(criterion: SuccessCriterion, outcome: AdapterOutcome): EvaluationResult {
        switch (criterion.kind) {
            case 'exitZero':
                return SuccessCriterionEvaluator._exitZero(outcome);
            case 'regex':
                return SuccessCriterionEvaluator._regex(criterion, outcome);
            case 'empty':
                return SuccessCriterionEvaluator._stdoutEmpty(outcome, true);
            case 'nonEmpty':
                return SuccessCriterionEvaluator._stdoutEmpty(outcome, false);
            case 'httpStatus':
                return SuccessCriterionEvaluator._httpStatus(criterion, outcome);
            case 'manualConfirm':
                return SuccessCriterionEvaluator._manualConfirm(outcome);
            default:
                return {status: CheckStatus.Unknown, reason: `unknown_criterion: ${criterion.kind}`};
        }
    }

    /**
     * @param {AdapterOutcome} outcome - The outcome.
     * @returns {EvaluationResult} Passed when the exit code is zero.
     */
    protected static _exitZero(outcome: AdapterOutcome): EvaluationResult {
        const passed = outcome.exitCode === 0;
        return {status: passed ? CheckStatus.Passed : CheckStatus.Failed, reason: `exit_code: ${outcome.exitCode ?? 'none'}`};
    }

    /**
     * @param {SuccessCriterion} criterion - The criterion carrying pattern/flags.
     * @param {AdapterOutcome} outcome - The outcome whose stdout is tested.
     * @returns {EvaluationResult} Passed when the pattern matches stdout.
     */
    protected static _regex(criterion: SuccessCriterion, outcome: AdapterOutcome): EvaluationResult {
        if (!RegexParamsSchema.validate(criterion.params, [])) {
            return {status: CheckStatus.Unknown, reason: 'invalid_criterion_params'};
        }

        let pattern: RegExp;

        try {
            pattern = new RegExp(criterion.params.pattern, criterion.params.flags ?? '');
        } catch {
            return {status: CheckStatus.Unknown, reason: 'invalid_regex'};
        }

        const matched = pattern.test(outcome.stdout ?? '');
        return {status: matched ? CheckStatus.Passed : CheckStatus.Failed, reason: matched ? 'matched' : 'no_match'};
    }

    /**
     * @param {AdapterOutcome} outcome - The outcome whose stdout is measured.
     * @param {boolean} wantEmpty - True to pass on empty stdout, false on non-empty.
     * @returns {EvaluationResult} Passed when the emptiness matches wantEmpty.
     */
    protected static _stdoutEmpty(outcome: AdapterOutcome, wantEmpty: boolean): EvaluationResult {
        const isEmpty = (outcome.stdout ?? '').length === 0;
        const passed = isEmpty === wantEmpty;
        return {status: passed ? CheckStatus.Passed : CheckStatus.Failed, reason: isEmpty ? 'stdout_empty' : 'stdout_non_empty'};
    }

    /**
     * @param {SuccessCriterion} criterion - The criterion carrying the expected status.
     * @param {AdapterOutcome} outcome - The outcome whose httpStatus is compared.
     * @returns {EvaluationResult} Passed when the status equals the expected one.
     */
    protected static _httpStatus(criterion: SuccessCriterion, outcome: AdapterOutcome): EvaluationResult {
        if (!HttpStatusParamsSchema.validate(criterion.params, [])) {
            return {status: CheckStatus.Unknown, reason: 'invalid_criterion_params'};
        }

        if (outcome.httpStatus === undefined) {
            return {status: CheckStatus.Unknown, reason: 'no_http_status'};
        }

        const passed = outcome.httpStatus === criterion.params.equals;
        return {status: passed ? CheckStatus.Passed : CheckStatus.Failed, reason: `http_status: ${outcome.httpStatus}`};
    }

    /**
     * @param {AdapterOutcome} outcome - The outcome carrying the confirmation.
     * @returns {EvaluationResult} Passed/failed on true/false; unknown when unanswered.
     */
    protected static _manualConfirm(outcome: AdapterOutcome): EvaluationResult {
        if (outcome.confirmed === undefined) {
            return {status: CheckStatus.Unknown, reason: 'awaiting_confirmation'};
        }

        return {status: outcome.confirmed ? CheckStatus.Passed : CheckStatus.Failed, reason: `confirmed: ${outcome.confirmed}`};
    }

}