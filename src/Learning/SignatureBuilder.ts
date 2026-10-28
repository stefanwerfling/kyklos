/**
 * SignatureBuilder — builds stable, deterministic fingerprints.
 *
 * The same technical situation always produces the same signature, so later
 * cycles can match similar prior incidents. Parts are normalized (trimmed,
 * lower-cased, whitespace collapsed) and joined, so cosmetic differences do not
 * create false mismatches.
 */

const WHITESPACE = /\s+/gu;

/**
 * Static builder of deterministic signatures.
 */
export class SignatureBuilder {

    /**
     * Build a signature from ordered parts.
     * @param {string[]} parts - The ordered parts (e.g. group, check id, status).
     * @returns {string} A deterministic, normalized signature.
     */
    public static build(parts: string[]): string {
        return parts.map((part): string => SignatureBuilder._normalize(part)).join(':');
    }

    /**
     * Normalize a single part.
     * @param {string} part - The raw part.
     * @returns {string} The normalized part.
     */
    protected static _normalize(part: string): string {
        return part.trim().toLowerCase().replace(WHITESPACE, '_');
    }

}