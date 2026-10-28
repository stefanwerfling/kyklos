/**
 * Schema-checked encode/decode between domain values and canonical JSON text.
 *
 * encode validates before writing; decode validates after parsing. Both throw
 * a KyklosError with the schema errors attached when validation fails, so no
 * invalid value ever enters or leaves the store.
 */
import {ExtractSchemaResultType, Schema, SchemaErrors} from 'vts';
import {KyklosError, KyklosErrorCode} from '../KyklosError.js';
import {CanonicalJson} from './CanonicalJson.js';

/**
 * Static helper for schema-checked (de)serialization.
 */
export class Codec {

    /**
     * Validate a value against its schema or throw a KyklosError.
     * @param {Schema<unknown>} schema - The vts schema to validate against.
     * @param {unknown} value - The value to validate.
     * @returns {void}
     */
    public static assertValid<S extends Schema<unknown>>(schema: S, value: unknown): void {
        const errors: SchemaErrors = [];

        if (!schema.validate(value, errors)) {
            throw new KyklosError(KyklosErrorCode.ValidationFailed, 'Value does not satisfy its schema', errors);
        }
    }

    /**
     * Validate a value and serialize it to canonical JSON.
     * @param {Schema<unknown>} schema - The vts schema the value must satisfy.
     * @param {ExtractSchemaResultType} value - The value to serialize.
     * @returns {string} Canonical JSON text.
     */
    public static encode<S extends Schema<unknown>>(schema: S, value: ExtractSchemaResultType<S>): string {
        Codec.assertValid(schema, value);
        return CanonicalJson.stringify(value);
    }

    /**
     * Parse canonical JSON text and validate it against the schema.
     * @param {Schema<unknown>} schema - The vts schema the parsed value must satisfy.
     * @param {string} text - Canonical JSON text to parse.
     * @returns {ExtractSchemaResultType} The validated value.
     */
    public static decode<S extends Schema<unknown>>(schema: S, text: string): ExtractSchemaResultType<S> {
        const parsed: unknown = JSON.parse(text);
        Codec.assertValid(schema, parsed);
        return parsed as ExtractSchemaResultType<S>;
    }

}