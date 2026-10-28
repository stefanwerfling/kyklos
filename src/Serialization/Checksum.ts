/**
 * Content checksums for evidence and canonical records.
 */
import {createHash} from 'node:crypto';
import {CanonicalJson} from './CanonicalJson.js';

/**
 * Static helper for sha256 checksums.
 */
export class Checksum {

    /**
     * Lower-case hex sha256 of a UTF-8 string.
     * @param {string} data - The input string.
     * @returns {string} Lower-case hex sha256 digest.
     */
    public static sha256Hex(data: string): string {
        return createHash('sha256').update(data, 'utf8').digest('hex');
    }

    /**
     * Lower-case hex sha256 over the canonical JSON of a value.
     * @param {unknown} value - The value to hash.
     * @returns {string} Lower-case hex sha256 digest.
     */
    public static sha256OfValue(value: unknown): string {
        return Checksum.sha256Hex(CanonicalJson.stringify(value));
    }

}