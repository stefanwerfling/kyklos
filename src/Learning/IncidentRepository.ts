/**
 * IncidentRepository — append-only incident storage with similarity search.
 */
import {Incident, IncidentSchema} from '../Domain/Incident.js';
import {FileStore} from '../Store/FileStore.js';
import {IncidentMatcher, IncidentQuery} from './IncidentMatcher.js';

/**
 * Stores incidents and finds similar prior ones.
 */
export class IncidentRepository {

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
     * Append an incident (append-only).
     * @param {Incident} incident - The incident to store.
     * @returns {Promise<void>}
     */
    public async save(incident: Incident): Promise<void> {
        await this._store.appendRecord('incident', IncidentSchema, incident);
    }

    /**
     * List all stored incidents.
     * @returns {Promise<Incident[]>} All incidents, ordered by file name.
     */
    public async all(): Promise<Incident[]> {
        return this._store.listRecords('incident', IncidentSchema);
    }

    /**
     * Find prior incidents similar to a query.
     * @param {IncidentQuery} query - Signature (and optional classification) to match.
     * @returns {Promise<Incident[]>} The matching incidents, ordered by id.
     */
    public async findSimilar(query: IncidentQuery): Promise<Incident[]> {
        const all = await this._store.listRecords('incident', IncidentSchema);
        return IncidentMatcher.match(all, query);
    }

}