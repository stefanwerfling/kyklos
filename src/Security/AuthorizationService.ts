/**
 * AuthorizationService — the single policy decision point for RBAC.
 *
 * It resolves an actor's role ids to the union of their capabilities and the
 * highest permission tier they may act at. Every decision is fail-closed: no
 * role, an unknown role, or a missing capability means deny — never a silent
 * pass. Approvals add two guards on top: a production release needs its own
 * capability, and a release cannot be approved by the same actor who performed
 * the work (separation of duties). The deterministic core is unchanged; callers
 * consult this service before a side-effectful or releasing action.
 */
import {Capability, EnvironmentKind, PermissionTier} from '../Domain/Common.js';
import {Actor} from '../Domain/Actor.js';
import {Task} from '../Domain/Task.js';
import {KyklosError, KyklosErrorCode} from '../KyklosError.js';
import {PermissionPolicy} from './PermissionPolicy.js';
import {RoleRegistry} from './RoleRegistry.js';

/**
 * Context for authorizing an approval decision.
 */
export interface ApprovalContext {

    /**
     * The actor who performed the work being approved (for separation of duties).
     * @member {string|undefined}
     */
    performedBy?: string;

    /**
     * The environment kind the release targets; production needs its own capability.
     * @member {EnvironmentKind|undefined}
     */
    environmentKind?: EnvironmentKind;
}

/**
 * Resolves roles to capabilities and makes fail-closed access decisions.
 */
export class AuthorizationService {

    /**
     * The registry that resolves role ids to roles.
     * @member {RoleRegistry}
     */
    protected readonly _registry: RoleRegistry;

    /**
     * @param {RoleRegistry} registry - The role registry to resolve against.
     */
    public constructor(registry: RoleRegistry) {
        this._registry = registry;
    }

    /**
     * The union of capabilities an actor holds across their (known) roles.
     * @param {Actor} actor - The actor.
     * @returns {Set<Capability>} The granted capabilities (empty when none).
     */
    public capabilities(actor: Actor): Set<Capability> {
        const granted = new Set<Capability>();

        for (const roleId of actor.roles) {
            const role = this._registry.resolve(roleId);

            if (role !== undefined) {
                for (const capability of role.capabilities) {
                    granted.add(capability);
                }
            }
        }

        return granted;
    }

    /**
     * Whether an actor holds a capability. Fail-closed.
     * @param {Actor} actor - The actor.
     * @param {Capability} capability - The capability to check.
     * @returns {boolean} True only when a known role grants it.
     */
    public can(actor: Actor, capability: Capability): boolean {
        return this.capabilities(actor).has(capability);
    }

    /**
     * The highest permission tier the actor may act at (Read when no role grants more).
     * @param {Actor} actor - The actor.
     * @returns {PermissionTier} The ceiling across the actor's known roles.
     */
    public maxTier(actor: Actor): PermissionTier {
        let best = PermissionTier.Read;
        let bestRank = PermissionPolicy.rank(PermissionTier.Read);

        for (const roleId of actor.roles) {
            const role = this._registry.resolve(roleId);

            if (role === undefined) {
                continue;
            }

            const rank = PermissionPolicy.rank(role.maxTier);

            if (rank > bestRank) {
                best = role.maxTier;
                bestRank = rank;
            }
        }

        return best;
    }

    /**
     * Require a capability; throw when the actor lacks it.
     * @param {Actor} actor - The actor.
     * @param {Capability} capability - The required capability.
     * @returns {void}
     * @throws {KyklosError} When the actor holds no role granting the capability.
     */
    public authorize(actor: Actor, capability: Capability): void {
        if (!this.can(actor, capability)) {
            throw new KyklosError(KyklosErrorCode.InvalidState, `actor '${actor.id}' lacks capability '${capability}'`);
        }
    }

    /**
     * Authorize an approval: capability, production gate and separation of duties.
     * @param {Actor} actor - The approving actor.
     * @param {Task} task - The approval task (for context in errors).
     * @param {ApprovalContext} [context] - Who performed the work and the target environment.
     * @returns {void}
     * @throws {KyklosError} When a capability is missing or the approver performed the work.
     */
    public authorizeApproval(actor: Actor, task: Task, context?: ApprovalContext): void {
        this.authorize(actor, Capability.ApproveRelease);

        if (context?.environmentKind === EnvironmentKind.Production) {
            this.authorize(actor, Capability.ApproveProductionRelease);
        }

        if (context?.performedBy === actor.id) {
            throw new KyklosError(KyklosErrorCode.InvalidState, `actor '${actor.id}' cannot approve task '${task.id}' they performed (separation of duties)`);
        }
    }

}