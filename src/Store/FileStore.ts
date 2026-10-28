/**
 * FileStore — a deterministic, file-based JSON store.
 *
 * Definitions (Procedure/Checklist/Check) are immutable per id+version: a
 * second write of the same id+version is refused. Records (Cycle, Observation,
 * ...) are append-only: a second write of the same id is refused. Every write
 * goes through canonical JSON so the on-disk bytes are reproducible, and every
 * read is schema-validated.
 */
import {mkdir, readdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {ExtractSchemaResultType, Schema} from 'vts';
import {KyklosError, KyklosErrorCode} from '../KyklosError.js';
import {CanonicalJson} from '../Serialization/CanonicalJson.js';
import {Codec} from '../Serialization/Codec.js';

/**
 * Identity of a versioned definition.
 */
export interface DefinitionIdentity {
    id: string;
    version: string;
}

/**
 * Identity of an append-only record.
 */
export interface RecordIdentity {
    id: string;
}

/**
 * File-based implementation of the Kyklos object store.
 */
export class FileStore {

    /**
     * Absolute or relative root directory of the store.
     * @member {string}
     */
    protected readonly _rootDir: string;

    /**
     * @param {string} rootDir - Root directory under which definitions and records are written.
     */
    public constructor(rootDir: string) {
        this._rootDir = rootDir;
    }

    /**
     * Write a definition immutably. Fails if the id+version already exists.
     * @param {string} collection - Definition collection, e.g. 'procedure', 'checklist', 'check'.
     * @param {Schema<unknown>} schema - The vts schema the value must satisfy.
     * @param {ExtractSchemaResultType} value - The definition value (must carry id + version).
     * @returns {Promise<void>}
     */
    public async putDefinition<S extends Schema<unknown>>(collection: string, schema: S, value: ExtractSchemaResultType<S>): Promise<void> {
        Codec.assertValid(schema, value);
        const identity = value as unknown as DefinitionIdentity;
        const path = this._definitionPath(collection, identity.id, identity.version);
        await this._writeNew(path, value, KyklosErrorCode.DefinitionExists, `Definition '${collection}/${identity.id}@${identity.version}' already exists and is immutable`);
    }

    /**
     * Read and validate a definition.
     * @param {string} collection - Definition collection.
     * @param {string} id - Definition id.
     * @param {string} version - Definition version.
     * @param {Schema<unknown>} schema - The vts schema the stored value must satisfy.
     * @returns {Promise<ExtractSchemaResultType>} The validated definition.
     */
    public async getDefinition<S extends Schema<unknown>>(collection: string, id: string, version: string, schema: S): Promise<ExtractSchemaResultType<S>> {
        return this._readValidated(this._definitionPath(collection, id, version), schema);
    }

    /**
     * Append a record immutably. Fails if the id already exists.
     * @param {string} collection - Record collection, e.g. 'cycle', 'observation'.
     * @param {Schema<unknown>} schema - The vts schema the value must satisfy.
     * @param {ExtractSchemaResultType} value - The record value (must carry id).
     * @returns {Promise<void>}
     */
    public async appendRecord<S extends Schema<unknown>>(collection: string, schema: S, value: ExtractSchemaResultType<S>): Promise<void> {
        Codec.assertValid(schema, value);
        const identity = value as unknown as RecordIdentity;
        const path = this._recordPath(collection, identity.id);
        await this._writeNew(path, value, KyklosErrorCode.RecordExists, `Record '${collection}/${identity.id}' already exists (append-only store)`);
    }

    /**
     * Read and validate a record.
     * @param {string} collection - Record collection.
     * @param {string} id - Record id.
     * @param {Schema<unknown>} schema - The vts schema the stored value must satisfy.
     * @returns {Promise<ExtractSchemaResultType>} The validated record.
     */
    public async getRecord<S extends Schema<unknown>>(collection: string, id: string, schema: S): Promise<ExtractSchemaResultType<S>> {
        return this._readValidated(this._recordPath(collection, id), schema);
    }

    /**
     * Read and validate every record in a collection, ordered by file name.
     * @param {string} collection - Record collection.
     * @param {Schema<unknown>} schema - The vts schema each stored value must satisfy.
     * @returns {Promise<ExtractSchemaResultType[]>} The validated records (empty if none).
     */
    public async listRecords<S extends Schema<unknown>>(collection: string, schema: S): Promise<ExtractSchemaResultType<S>[]> {
        const dir = join(this._rootDir, 'records', collection);
        let files: string[];

        try {
            files = await readdir(dir);
        } catch (error: unknown) {
            if (FileStore._errorCode(error) === 'ENOENT') {
                return [];
            }

            throw error;
        }

        const jsonFiles = files.filter((file): boolean => file.endsWith('.json')).sort();
        const result: ExtractSchemaResultType<S>[] = [];

        for (const file of jsonFiles) {
            // sequential by design — deterministic ordered reads
            // eslint-disable-next-line no-await-in-loop
            const value = await this._readValidated(join(dir, file), schema);
            result.push(value);
        }

        return result;
    }

    /**
     * Build the on-disk path of a definition.
     * @param {string} collection - Definition collection.
     * @param {string} id - Definition id.
     * @param {string} version - Definition version.
     * @returns {string} The file path.
     */
    protected _definitionPath(collection: string, id: string, version: string): string {
        return join(this._rootDir, 'definitions', collection, id, `${version}.json`);
    }

    /**
     * Build the on-disk path of a record.
     * @param {string} collection - Record collection.
     * @param {string} id - Record id.
     * @returns {string} The file path.
     */
    protected _recordPath(collection: string, id: string): string {
        return join(this._rootDir, 'records', collection, `${id}.json`);
    }

    /**
     * Create a file atomically; throw a typed error if it already exists.
     * @param {string} path - Target file path.
     * @param {unknown} value - The value to write as canonical JSON.
     * @param {KyklosErrorCode} existsCode - Error code to raise on collision.
     * @param {string} existsMessage - Error message to raise on collision.
     * @returns {Promise<void>}
     */
    protected async _writeNew(path: string, value: unknown, existsCode: KyklosErrorCode, existsMessage: string): Promise<void> {
        await mkdir(dirname(path), {recursive: true});
        const text = CanonicalJson.stringify(value);

        try {
            await writeFile(path, text, {encoding: 'utf8', flag: 'wx'});
        } catch (error: unknown) {
            if (FileStore._errorCode(error) === 'EEXIST') {
                throw new KyklosError(existsCode, existsMessage);
            }

            throw error;
        }
    }

    /**
     * Read a file and validate its content against a schema.
     * @param {string} path - Source file path.
     * @param {Schema<unknown>} schema - The vts schema the content must satisfy.
     * @returns {Promise<ExtractSchemaResultType>} The validated value.
     */
    protected async _readValidated<S extends Schema<unknown>>(path: string, schema: S): Promise<ExtractSchemaResultType<S>> {
        let text: string;

        try {
            text = await readFile(path, {encoding: 'utf8'});
        } catch (error: unknown) {
            if (FileStore._errorCode(error) === 'ENOENT') {
                throw new KyklosError(KyklosErrorCode.NotFound, `No entry at '${path}'`);
            }

            throw error;
        }

        return Codec.decode(schema, text);
    }

    /**
     * Extract the string 'code' from a Node system error, if present.
     * @param {unknown} error - The caught error.
     * @returns {string|undefined} The error code, or undefined.
     */
    protected static _errorCode(error: unknown): string|undefined {
        if (error !== null && typeof error === 'object' && 'code' in error) {
            const code = (error as {code: unknown;}).code;
            return typeof code === 'string' ? code : undefined;
        }

        return undefined;
    }

}