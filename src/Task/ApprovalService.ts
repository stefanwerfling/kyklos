/**
 * ApprovalService — records authorized approvals and bridges them to the gate.
 *
 * Authorization is checked at write time and fail-closed: an actor without the
 * task's required role cannot record an approval. A recorded approval is the
 * authorized evidence; `toReleaseOverride` turns an approve decision into the
 * existing ReleaseGate override shape, so the release decider is backed by a
 * real, role-checked approval instead of a self-declared string — ReleaseGate
 * itself is unchanged.
 */
import {Actor} from '../Domain/Actor.js';
import {Approval, ApprovalSchema} from '../Domain/Approval.js';
import {ApprovalDecision} from '../Domain/Common.js';
import {Task} from '../Domain/Task.js';
import {ReleaseOverride} from '../Cycle/ReleaseGate.js';
import {Clock} from '../Cycle/Clock.js';
import {IdGenerator} from '../Cycle/IdGenerator.js';
import {KyklosError, KyklosErrorCode} from '../KyklosError.js';
import {ApprovalContext, AuthorizationService} from '../Security/AuthorizationService.js';
import {FileStore} from '../Store/FileStore.js';

/**
 * Collaborators the approval service depends on.
 */
export interface ApprovalServiceOptions {
    idGenerator: IdGenerator;
    clock: Clock;
    store?: FileStore;
    authorization?: AuthorizationService;
}

/**
 * Records approvals and bridges them to release decisions.
 */
export class ApprovalService {

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
     * Optional store to persist approvals.
     * @member {FileStore|undefined}
     */
    protected readonly _store: FileStore|undefined;

    /**
     * Optional RBAC decision point. When set, it replaces the role-string check
     * with a capability + production + separation-of-duties check (fail-closed).
     * @member {AuthorizationService|undefined}
     */
    protected readonly _authorization: AuthorizationService|undefined;

    /**
     * @param {ApprovalServiceOptions} options - Injected collaborators.
     */
    public constructor(options: ApprovalServiceOptions) {
        this._idGenerator = options.idGenerator;
        this._clock = options.clock;
        this._store = options.store;
        this._authorization = options.authorization;
    }

    /**
     * Record an authorized decision on an approval task.
     * @param {Task} task - The approval task.
     * @param {Actor} actor - The deciding actor.
     * @param {ApprovalDecision} decision - Approve or reject.
     * @param {string} rationale - Why.
     * @param {ApprovalContext} [context] - Who performed the work and the target environment (RBAC path only).
     * @returns {Promise<Approval>} The recorded approval.
     * @throws {KyklosError} When the actor is not authorized to approve.
     */
    public async decide(task: Task, actor: Actor, decision: ApprovalDecision, rationale: string, context?: ApprovalContext): Promise<Approval> {
        const role = task.assigneeRole;

        if (this._authorization === undefined) {
            if (role !== undefined && !actor.roles.includes(role)) {
                throw new KyklosError(KyklosErrorCode.InvalidState, `actor '${actor.id}' lacks required role '${role}' to approve`);
            }
        } else {
            this._authorization.authorizeApproval(actor, task, context);
        }

        const approval: Approval = {
            id: this._idGenerator.next('appr'),
            taskId: task.id,
            actorId: actor.id,
            decision: decision,
            rationale: rationale,
            role: role ?? (actor.roles[0] ?? ''),
            decidedAt: this._clock.now()
        };

        if (this._store !== undefined) {
            await this._store.appendRecord('approval', ApprovalSchema, approval);
        }

        return approval;
    }

    /**
     * Turn an approve decision into a ReleaseGate override.
     * @param {Approval} approval - An approve approval.
     * @returns {ReleaseOverride} An override backed by the authorized approval.
     * @throws {KyklosError} When the approval is not an approve.
     */
    public static toReleaseOverride(approval: Approval): ReleaseOverride {
        if (approval.decision !== ApprovalDecision.Approve) {
            throw new KyklosError(KyklosErrorCode.InvalidState, `cannot build a release override from a ${approval.decision} approval`);
        }

        return {decidedBy: approval.actorId, justification: approval.rationale};
    }

}