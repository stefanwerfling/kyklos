/**
 * RoleRegistry — resolves role ids to their Role definitions.
 *
 * In-memory and injected (like PermissionPolicy): the caller supplies the
 * active roles. Resolution is by id; an unknown id resolves to undefined and so
 * grants nothing downstream (fail-closed). Roles are versioned definitions and
 * can also be persisted generically through FileStore.putDefinition('role', …);
 * this registry is the read model the AuthorizationService consults.
 */
import {Role} from '../Domain/Role.js';

/**
 * In-memory registry of the active roles, keyed by id.
 */
export class RoleRegistry {

    /**
     * Active role per id (last one wins if an id is supplied twice).
     * @member {Map<string, Role>}
     */
    protected readonly _roles: Map<string, Role>;

    /**
     * @param {Role[]} roles - The active roles to register.
     */
    public constructor(roles: Role[]) {
        this._roles = new Map<string, Role>();

        for (const role of roles) {
            this._roles.set(role.id, role);
        }
    }

    /**
     * Resolve a role by id.
     * @param {string} roleId - The role id (as held in Actor.roles).
     * @returns {Role|undefined} The role, or undefined when the id is unknown.
     */
    public resolve(roleId: string): Role|undefined {
        return this._roles.get(roleId);
    }

    /**
     * Every registered role, ordered by id.
     * @returns {Role[]} The active roles.
     */
    public all(): Role[] {
        return [...this._roles.values()].sort((left, right): number => left.id.localeCompare(right.id));
    }

}