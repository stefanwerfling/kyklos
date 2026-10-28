/**
 * ProposalService — the validation-gated proposal lifecycle.
 *
 * The central rule: a proposal can only be accepted once its validation result
 * is "passed". Accepting an unvalidated or failed proposal throws. This is what
 * stops an experience-derived suggestion from silently becoming a binding
 * release criterion.
 */
import {ProposalStatus, ValidationResult} from '../Domain/Common.js';
import {ImprovementProposal} from '../Domain/ImprovementProposal.js';
import {KyklosError, KyklosErrorCode} from '../KyklosError.js';

/**
 * Static operations on an improvement proposal's lifecycle.
 */
export class ProposalService {

    /**
     * Record a validation result. On "passed" the proposal becomes validated;
     * otherwise the status is unchanged (it may be re-validated or rejected).
     * @param {ImprovementProposal} proposal - The proposal to validate.
     * @param {ValidationResult} result - The validation result.
     * @param {string[]} [evidenceIds] - Supporting evidence ids.
     * @param {string} [method] - How the proposal was validated.
     * @returns {ImprovementProposal} A new proposal with the validation recorded.
     */
    public static validate(proposal: ImprovementProposal, result: ValidationResult, evidenceIds?: string[], method?: string): ImprovementProposal {
        const status = result === ValidationResult.Passed ? ProposalStatus.Validated : proposal.status;
        return {
            ...proposal,
            validation: {result: result, method: method, evidenceIds: evidenceIds ?? []},
            status: status
        };
    }

    /**
     * Accept a proposal. Requires a passed validation, otherwise throws.
     * @param {ImprovementProposal} proposal - The proposal to accept.
     * @returns {ImprovementProposal} A new accepted proposal.
     */
    public static accept(proposal: ImprovementProposal): ImprovementProposal {
        if (proposal.validation.result !== ValidationResult.Passed) {
            throw new KyklosError(KyklosErrorCode.InvalidState, `Proposal '${proposal.id}' cannot be accepted without a passed validation`);
        }

        return {...proposal, status: ProposalStatus.Accepted};
    }

    /**
     * Reject a proposal.
     * @param {ImprovementProposal} proposal - The proposal to reject.
     * @returns {ImprovementProposal} A new rejected proposal.
     */
    public static reject(proposal: ImprovementProposal): ImprovementProposal {
        return {...proposal, status: ProposalStatus.Rejected};
    }

}