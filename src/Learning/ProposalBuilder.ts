/**
 * ProposalBuilder — builds an improvement proposal from an incident.
 *
 * A fresh proposal starts proposed, with a pending validation. It is only ever
 * a suggestion; nothing it touches changes until it is validated and explicitly
 * accepted.
 */
import {ProposalStatus, ProposalTargetType, ValidationResult} from '../Domain/Common.js';
import {ImprovementProposal} from '../Domain/ImprovementProposal.js';
import {Incident} from '../Domain/Incident.js';

/**
 * The target and content of a new proposal.
 */
export interface ProposalDraft {

    /**
     * What the proposal targets.
     * @member {ProposalTargetType}
     */
    targetType: ProposalTargetType;

    /**
     * Id of the targeted checklist or check.
     * @member {string}
     */
    targetId: string;

    /**
     * Why the change is proposed.
     * @member {string}
     */
    rationale: string;

    /**
     * Human-readable proposed change.
     * @member {string}
     */
    diff: string;
}

/**
 * Static builder of improvement proposals.
 */
export class ProposalBuilder {

    /**
     * Build a proposal motivated by an incident.
     * @param {Incident} incident - The motivating incident.
     * @param {ProposalDraft} draft - Target and content of the proposal.
     * @param {string} id - The proposal id (from the caller's id source).
     * @param {string} createdAt - The creation timestamp (from the caller's clock).
     * @returns {ImprovementProposal} A proposed, not-yet-validated proposal.
     */
    public static fromIncident(incident: Incident, draft: ProposalDraft, id: string, createdAt: string): ImprovementProposal {
        return {
            id: id,
            incidentId: incident.id,
            targetType: draft.targetType,
            targetId: draft.targetId,
            rationale: draft.rationale,
            diff: draft.diff,
            status: ProposalStatus.Proposed,
            validation: {result: ValidationResult.Pending, evidenceIds: []},
            createdAt: createdAt
        };
    }

}