/**
 * Clock — an injectable time source, so cycle runs are reproducible in tests.
 */

/**
 * Provides the current time as an ISO-8601 string.
 */
export interface Clock {

    /**
     * @returns {string} The current time as an ISO-8601 string.
     */
    now(): string;
}

/**
 * Default clock backed by the system time.
 */
export class SystemClock implements Clock {

    /**
     * @returns {string} The current system time as an ISO-8601 string.
     */
    public now(): string {
        return new Date().toISOString();
    }

}