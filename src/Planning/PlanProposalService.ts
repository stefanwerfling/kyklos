/**
 * PlanProposalService — turns an LLM plan candidate into an auditable, gated
 * proposal, and is the only path by which a plan becomes runnable.
 *
 * `record` stores the candidate as a draft definition (never runnable) plus a
 * PlanProposal (origin llm_assertion). `validate` runs the deterministic
 * PlanValidator and marks the proposal validated only on a clean pass. `publish`
 * is fail-closed: it requires a passed validation and an actor with the
 * PublishPlan capability, and only then writes a new, published version of the
 * definition. There is deliberately no path for the LLM to publish or to set a
 * status — the deterministic core still only ever runs published definitions.
 */
import {Actor} from '../Domain/Actor.js';
import {Capability, EvidenceSource, PlanKind, PlaybookStatus, ProposalStatus, ValidationResult, WorkflowStatus} from '../Domain/Common.js';
import {PlanProposal, PlanProposalSchema} from '../Domain/PlanProposal.js';
import {Playbook, PlaybookSchema} from '../Domain/Playbook.js';
import {Workflow, WorkflowSchema} from '../Domain/Workflow.js';
import {Clock} from '../Cycle/Clock.js';
import {IdGenerator} from '../Cycle/IdGenerator.js';
import {KyklosError, KyklosErrorCode} from '../KyklosError.js';
import {DefinitionSource} from '../Playbook/PlaybookCompiler.js';
import {AuthorizationService} from '../Security/AuthorizationService.js';
import {FileStore} from '../Store/FileStore.js';
import {PlanCandidate} from './PlanCandidate.js';
import {PlanValidator} from './PlanValidator.js';

/**
 * Collaborators the plan proposal service depends on.
 */
export interface PlanProposalServiceOptions {
    store: FileStore;
    idGenerator: IdGenerator;
    clock: Clock;
    authorization?: AuthorizationService;
}

/**
 * The outcome of publishing a validated plan.
 */
export interface PlanPublication {
    proposal: PlanProposal;
    publishedId: string;
    publishedVersion: string;
}

/**
 * Records, validates and (with authorization) publishes proposed plans.
 */
export class PlanProposalService {

    /**
     * Backing store.
     * @member {FileStore}
     */
    protected readonly _store: FileStore;

    /**
     * Injected id source.
     * @member {IdGenerator}
     */
    protected readonly _idGenerator: IdGenerator;

    /**
     * Injected clock.
     * @member {Clock}
     */
    protected readonly _clock: Clock;

    /**
     * RBAC decision point; required to publish (fail-closed when absent).
     * @member {AuthorizationService|undefined}
     */
    protected readonly _authorization: AuthorizationService|undefined;

    /**
     * @param {PlanProposalServiceOptions} options - Store and injected collaborators.
     */
    public constructor(options: PlanProposalServiceOptions) {
        this._store = options.store;
        this._idGenerator = options.idGenerator;
        this._clock = options.clock;
        this._authorization = options.authorization;
    }

    /**
     * Record a candidate as a draft definition plus a proposed PlanProposal.
     * @param {PlanCandidate} candidate - The proposed plan.
     * @returns {Promise<PlanProposal>} The recorded proposal (status proposed).
     * @throws {KyklosError} When the candidate is missing or not a draft.
     */
    public async record(candidate: PlanCandidate): Promise<PlanProposal> {
        const identity = await this._storeDraft(candidate);

        const proposal: PlanProposal = {
            id: this._idGenerator.next('planprop'),
            kind: candidate.kind,
            goal: candidate.goal,
            candidateId: identity.id,
            candidateVersion: identity.version,
            origin: EvidenceSource.LlmAssertion,
            rationale: candidate.rationale,
            validation: {result: ValidationResult.Pending, diagnostics: [], method: undefined},
            status: ProposalStatus.Proposed,
            createdAt: this._clock.now()
        };

        await this._store.appendRecord('planProposal', PlanProposalSchema, proposal);
        return proposal;
    }

    /**
     * Validate a recorded proposal's candidate deterministically.
     * @param {PlanProposal} proposal - The recorded proposal.
     * @param {PlanCandidate} candidate - The candidate to validate.
     * @param {DefinitionSource} source - Definition source for structural checks.
     * @returns {Promise<PlanProposal>} The proposal with its validation filled in.
     */
    public async validate(proposal: PlanProposal, candidate: PlanCandidate, source: DefinitionSource): Promise<PlanProposal> {
        const outcome = await PlanValidator.validate(candidate, source);
        const status = outcome.result === ValidationResult.Passed ? ProposalStatus.Validated : proposal.status;
        return {...proposal, validation: {result: outcome.result, diagnostics: outcome.diagnostics, method: 'deterministic'}, status: status};
    }

    /**
     * Publish a validated plan: fail-closed on validation and authorization.
     * @param {PlanProposal} proposal - A proposal whose validation passed.
     * @param {PlanCandidate} candidate - The candidate to publish.
     * @param {Actor} actor - The authorizing actor.
     * @param {string} publishedVersion - The version to publish under (a new, immutable version).
     * @returns {Promise<PlanPublication>} The accepted proposal and the published identity.
     * @throws {KyklosError} When the plan is unvalidated or the actor is not authorized.
     */
    public async publish(proposal: PlanProposal, candidate: PlanCandidate, actor: Actor, publishedVersion: string): Promise<PlanPublication> {
        if (proposal.validation.result !== ValidationResult.Passed) {
            throw new KyklosError(KyklosErrorCode.InvalidState, `cannot publish plan '${proposal.id}': validation did not pass`);
        }

        if (this._authorization === undefined) {
            throw new KyklosError(KyklosErrorCode.InvalidState, `cannot publish plan '${proposal.id}': publishing requires an authorization service`);
        }

        this._authorization.authorize(actor, Capability.PublishPlan);
        const publishedId = await this._storePublished(candidate, publishedVersion);
        return {proposal: {...proposal, status: ProposalStatus.Accepted}, publishedId: publishedId, publishedVersion: publishedVersion};
    }

    /**
     * Store the candidate as a draft definition (fail-closed on a non-draft).
     * @param {PlanCandidate} candidate - The candidate.
     * @returns {Promise<{id: string; version: string;}>} The stored definition identity.
     * @throws {KyklosError} When the definition is missing or not a draft.
     */
    protected async _storeDraft(candidate: PlanCandidate): Promise<{id: string; version: string;}> {
        if (candidate.kind === PlanKind.Playbook && candidate.playbook !== undefined) {
            if (candidate.playbook.status !== PlaybookStatus.Draft) {
                throw new KyklosError(KyklosErrorCode.InvalidState, `candidate playbook '${candidate.playbook.id}' must be a draft`);
            }

            await this._store.putDefinition('playbook', PlaybookSchema, candidate.playbook);
            return {id: candidate.playbook.id, version: candidate.playbook.version};
        }

        if (candidate.kind === PlanKind.Workflow && candidate.workflow !== undefined) {
            if (candidate.workflow.status !== WorkflowStatus.Draft) {
                throw new KyklosError(KyklosErrorCode.InvalidState, `candidate workflow '${candidate.workflow.id}' must be a draft`);
            }

            await this._store.putDefinition('workflow', WorkflowSchema, candidate.workflow);
            return {id: candidate.workflow.id, version: candidate.workflow.version};
        }

        throw new KyklosError(KyklosErrorCode.InvalidState, 'candidate has no definition matching its kind');
    }

    /**
     * Write a new, published version of the candidate's definition.
     * @param {PlanCandidate} candidate - The candidate.
     * @param {string} publishedVersion - The version to publish under.
     * @returns {Promise<string>} The published definition id.
     * @throws {KyklosError} When the candidate has no definition matching its kind.
     */
    protected async _storePublished(candidate: PlanCandidate, publishedVersion: string): Promise<string> {
        if (candidate.kind === PlanKind.Playbook && candidate.playbook !== undefined) {
            const published: Playbook = {...candidate.playbook, version: publishedVersion, status: PlaybookStatus.Published};
            await this._store.putDefinition('playbook', PlaybookSchema, published);
            return published.id;
        }

        if (candidate.kind === PlanKind.Workflow && candidate.workflow !== undefined) {
            const published: Workflow = {...candidate.workflow, version: publishedVersion, status: WorkflowStatus.Published};
            await this._store.putDefinition('workflow', WorkflowSchema, published);
            return published.id;
        }

        throw new KyklosError(KyklosErrorCode.InvalidState, 'candidate has no definition matching its kind');
    }

}