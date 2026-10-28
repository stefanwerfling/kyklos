/**
 * Canonical JSON serialization.
 *
 * Object keys are sorted recursively before stringifying, so the same logical
 * value always produces the exact same text. This makes checksums and
 * round-trips deterministic regardless of key insertion order.
 */

/**
 * Static helper that serializes values to canonical (key-sorted) JSON.
 */
export class CanonicalJson {

    /**
     * Serialize a value to canonical (key-sorted) JSON.
     * @param {unknown} value - The value to serialize.
     * @returns {string} Canonical JSON text.
     */
    public static stringify(value: unknown): string {
        return JSON.stringify(CanonicalJson._sortValue(value));
    }

    /**
     * Recursively produce a key-sorted copy of a value.
     * @param {unknown} value - The value to copy.
     * @returns {unknown} A copy with object keys sorted.
     */
    protected static _sortValue(value: unknown): unknown {
        if (Array.isArray(value)) {
            return value.map((item: unknown): unknown => CanonicalJson._sortValue(item));
        }

        if (value !== null && typeof value === 'object') {
            const source = value as Record<string, unknown>;
            const result: Record<string, unknown> = {};

            for (const key of Object.keys(source).sort()) {
                result[key] = CanonicalJson._sortValue(source[key]);
            }

            return result;
        }

        return value;
    }

}