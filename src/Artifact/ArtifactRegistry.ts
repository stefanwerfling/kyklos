/**
 * ArtifactRegistry — content-addressed, immutable store of built artifacts.
 *
 * An artifact is keyed by its digest (its `id`). Registering the same digest
 * again is idempotent: the stored artifact is returned, because the same digest
 * means the same content. A different digest is a different artifact. This
 * composes the unchanged FileStore (append-only records) — no store internals
 * change.
 */
import {Artifact, ArtifactSchema} from '../Domain/Artifact.js';
import {KyklosError, KyklosErrorCode} from '../KyklosError.js';
import {FileStore} from '../Store/FileStore.js';

const ARTIFACT_COLLECTION = 'artifact';

/**
 * Registry of content-addressed artifacts over a FileStore.
 */
export class ArtifactRegistry {

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
     * Register an artifact by its digest. Idempotent on an identical digest.
     * @param {Artifact} artifact - The artifact to register (its id is the digest).
     * @returns {Promise<Artifact>} The stored artifact (existing one on a repeat digest).
     */
    public async register(artifact: Artifact): Promise<Artifact> {
        const existing = await this._get(artifact.id);

        if (existing !== undefined) {
            return existing;
        }

        await this._store.appendRecord(ARTIFACT_COLLECTION, ArtifactSchema, artifact);
        return artifact;
    }

    /**
     * Read an artifact by its digest.
     * @param {string} digest - The artifact digest (its id).
     * @returns {Promise<Artifact|undefined>} The artifact, or undefined if unknown.
     */
    public async get(digest: string): Promise<Artifact|undefined> {
        return this._get(digest);
    }

    /**
     * Read an artifact by digest, mapping NotFound to undefined.
     * @param {string} digest - The artifact digest (its id).
     * @returns {Promise<Artifact|undefined>} The artifact, or undefined if absent.
     */
    protected async _get(digest: string): Promise<Artifact|undefined> {
        try {
            return await this._store.getRecord(ARTIFACT_COLLECTION, digest, ArtifactSchema);
        } catch (error: unknown) {
            if (error instanceof KyklosError && error.code === KyklosErrorCode.NotFound) {
                return undefined;
            }

            throw error;
        }
    }

}