/**
 * Kyklos error type. A single error class carrying a machine-readable code,
 * so callers can branch on the code instead of parsing messages.
 */
import {SchemaErrors} from 'vts';

/**
 * Machine-readable error codes.
 */
export enum KyklosErrorCode {
    ValidationFailed = 'validation_failed',
    DefinitionExists = 'definition_exists',
    RecordExists = 'record_exists',
    NotFound = 'not_found',
    InvalidState = 'invalid_state'
}

/**
 * Error raised by Kyklos core operations.
 */
export class KyklosError extends Error {

    /**
     * Machine-readable code for programmatic branching.
     * @member {KyklosErrorCode}
     */
    public readonly code: KyklosErrorCode;

    /**
     * Schema validation errors, when the code is ValidationFailed.
     * @member {SchemaErrors|undefined}
     */
    public readonly details: SchemaErrors|undefined;

    /**
     * @param {KyklosErrorCode} code - Machine-readable error code.
     * @param {string} message - Human-readable English message.
     * @param {SchemaErrors} [details] - Optional schema validation errors.
     */
    public constructor(code: KyklosErrorCode, message: string, details?: SchemaErrors) {
        super(message);
        this.name = 'KyklosError';
        this.code = code;
        this.details = details;
    }

}