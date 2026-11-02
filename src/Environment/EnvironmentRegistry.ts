/**
 * EnvironmentRegistry — a registry of the environments a workflow can target.
 *
 * Environments are registered once (append-only); a changed environment is a
 * new id, not a mutation. Each environment points at a TargetSystem by id; the
 * caller resolves that to the concrete target when running. This composes the
 * unchanged FileStore — no store internals change.
 */
import {Environment, EnvironmentSchema} from '../Domain/Environment.js';
import {FileStore} from '../Store/FileStore.js';

const ENVIRONMENT_COLLECTION = 'environment';

/**
 * Registry of environments over a FileStore.
 */
export class EnvironmentRegistry {

    /**
     * Backing store.
     * @member {FileStore}
     */
    protected readonly _store: FileStore;

    /**
     * @param {FileStore} store - The backing file store.
     */
    public constructor(store: FileStore) {
        this._store = store;
    }

    /**
     * Register an environment (append-only; fails if the id already exists).
     * @param {Environment} environment - The environment to register.
     * @returns {Promise<void>}
     */
    public async put(environment: Environment): Promise<void> {
        await this._store.appendRecord(ENVIRONMENT_COLLECTION, EnvironmentSchema, environment);
    }

    /**
     * Read a registered environment.
     * @param {string} id - Environment id.
     * @returns {Promise<Environment>} The environment.
     * @throws {KyklosError} NotFound when the id is unknown.
     */
    public async get(id: string): Promise<Environment> {
        return this._store.getRecord(ENVIRONMENT_COLLECTION, id, EnvironmentSchema);
    }

    /**
     * List every registered environment, ordered by id.
     * @returns {Promise<Environment[]>} All environments (empty if none).
     */
    public async list(): Promise<Environment[]> {
        return this._store.listRecords(ENVIRONMENT_COLLECTION, EnvironmentSchema);
    }

}