/**
 * Deviation — a mismatch between the expected and the actual state.
 *
 * An append-only record. The signature is a stable, deterministic fingerprint
 * used later to find similar prior incidents (M5).
 */
import {ExtractSchemaResultType, Vts} from 'vts';
import {IdSchema, Severity} from './Common.js';

/**
 * Schema of Deviation.
 */
export const DeviationSchema = Vts.object({
    id: IdSchema,
    observationId: IdSchema,
    expected: Vts.unknown(),
    actual: Vts.unknown(),
    severity: Vts.enum(Severity),
    signature: Vts.string({description: 'Deterministic fingerprint for similarity matching'}),
    evidenceIds: Vts.array(IdSchema)
}, {objectSchema: {strict: true}});

/**
 * Type of schema Deviation.
 */
export type Deviation = ExtractSchemaResultType<typeof DeviationSchema>;