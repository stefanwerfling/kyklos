/**
 * StoreDefinitionSource — loads playbooks, procedures and checklists from the
 * FileStore at exact versions.
 *
 * Definitions are immutable per id+version, so loading a pinned version always
 * returns the same bytes — the resolver/compiler stay reproducible. A missing
 * definition maps to undefined (not an error), so callers report it as a
 * diagnostic rather than throwing.
 */
import {ChecklistSchema, Checklist} from '../Domain/Checklist.js';
import {Playbook, PlaybookSchema} from '../Domain/Playbook.js';
import {Procedure, ProcedureSchema} from '../Domain/Procedure.js';
import {KyklosError, KyklosErrorCode} from '../KyklosError.js';
import {FileStore} from '../Store/FileStore.js';
import {DefinitionSource} from './PlaybookCompiler.js';

/**
 * FileStore-backed definition source.
 */
export class StoreDefinitionSource implements DefinitionSource {

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
     * Load a playbook at an exact version.
     * @param {string} id - Playbook id.
     * @param {string} version - Exact version.
     * @returns {Promise<Playbook|undefined>} The playbook, or undefined if absent.
     */
    public async getPlaybook(id: string, version: string): Promise<Playbook|undefined> {
        return StoreDefinitionSource._optional(this._store.getDefinition('playbook', id, version, PlaybookSchema));
    }

    /**
     * Load a procedure at an exact version.
     * @param {string} id - Procedure id.
     * @param {string} version - Exact version.
     * @returns {Promise<Procedure|undefined>} The procedure, or undefined if absent.
     */
    public async getProcedure(id: string, version: string): Promise<Procedure|undefined> {
        return StoreDefinitionSource._optional(this._store.getDefinition('procedure', id, version, ProcedureSchema));
    }

    /**
     * Load a checklist at an exact version.
     * @param {string} id - Checklist id.
     * @param {string} version - Exact version.
     * @returns {Promise<Checklist|undefined>} The checklist, or undefined if absent.
     */
    public async getChecklist(id: string, version: string): Promise<Checklist|undefined> {
        return StoreDefinitionSource._optional(this._store.getDefinition('checklist', id, version, ChecklistSchema));
    }

    /**
     * Resolve a store read to undefined when the entry is simply not found.
     * @param {Promise<T>} read - The store read.
     * @returns {Promise<T|undefined>} The value, or undefined on NotFound.
     */
    protected static async _optional<T>(read: Promise<T>): Promise<T|undefined> {
        try {
            return await read;
        } catch (error: unknown) {
            if (error instanceof KyklosError && error.code === KyklosErrorCode.NotFound) {
                return undefined;
            }

            throw error;
        }
    }

}