/**
 * IdGenerator — an injectable id source, so cycle runs are reproducible in
 * tests.
 */
import {randomUUID} from 'node:crypto';

/**
 * Produces unique identifiers for append-only records.
 */
export interface IdGenerator {

    /**
     * @param {string} [prefix] - Optional prefix, e.g. 'cyc', 'obs', 'dev'.
     * @returns {string} A unique identifier.
     */
    next(prefix?: string): string;
}

/**
 * Default id generator backed by crypto.randomUUID.
 */
export class RandomIdGenerator implements IdGenerator {

    /**
     * @param {string} [prefix] - Optional prefix.
     * @returns {string} A prefixed random UUID.
     */
    public next(prefix?: string): string {
        return `${prefix ?? 'id'}-${randomUUID()}`;
    }

}