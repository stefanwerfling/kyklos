/**
 * Shared runtime types for check execution. These are in-memory runner types,
 * not persisted domain records.
 */
import {CheckStatus} from '../Domain/Common.js';

/**
 * Raw outcome of running a check action through an adapter.
 */
export interface AdapterOutcome {

    /**
     * Whether the action ran to completion. False means not executable
     * (timeout, not allow-listed, spawn/network error, invalid params).
     * @member {boolean}
     */
    executed: boolean;

    /**
     * Process exit code, when a shell action completed.
     * @member {number|undefined}
     */
    exitCode?: number;

    /**
     * Captured standard output.
     * @member {string|undefined}
     */
    stdout?: string;

    /**
     * Captured standard error.
     * @member {string|undefined}
     */
    stderr?: string;

    /**
     * HTTP status code, when an http action completed.
     * @member {number|undefined}
     */
    httpStatus?: number;

    /**
     * Response or output body.
     * @member {string|undefined}
     */
    body?: string;

    /**
     * Manual confirmation value, when a manual action was answered.
     * @member {boolean|undefined}
     */
    confirmed?: boolean;

    /**
     * Reason the action was not executable, when executed is false.
     * @member {string|undefined}
     */
    reason?: string;
}

/**
 * Result of evaluating a success criterion against an outcome.
 */
export interface EvaluationResult {

    /**
     * Resulting check status.
     * @member {CheckStatus}
     */
    status: CheckStatus;

    /**
     * Human-readable reason for the status.
     * @member {string}
     */
    reason: string;
}

/**
 * Options controlling a single check run.
 */
export interface RunOptions {

    /**
     * Mark the check as deliberately skipped.
     * @member {boolean|undefined}
     */
    skip?: boolean;

    /**
     * Whether the check's preconditions apply. Default true. False yields
     * not_applicable without executing the action.
     * @member {boolean|undefined}
     */
    applicable?: boolean;
}

/**
 * Deterministic result of running one check.
 */
export interface CheckRunResult {

    /**
     * Resulting check status.
     * @member {CheckStatus}
     */
    status: CheckStatus;

    /**
     * Human-readable reason for the status.
     * @member {string}
     */
    reason: string;

    /**
     * Raw adapter outcome, when the action was executed.
     * @member {AdapterOutcome|undefined}
     */
    outcome?: AdapterOutcome;
}