/**
 * Observation — a measured or observed state produced by running a check.
 *
 * An append-only record. Carries exactly one CheckStatus and references the
 * exact check version it came from.
 */
import {ExtractSchemaResultType, Vts} from 'vts';
import {CheckStatus, IdSchema, TimestampSchema, VersionSchema} from './Common.js';

/**
 * Schema of Observation.
 */
export const ObservationSchema = Vts.object({
    id: IdSchema,
    checkId: IdSchema,
    checkVersion: VersionSchema,
    status: Vts.enum(CheckStatus),
    actual: Vts.optional(Vts.unknown()),
    measuredAt: TimestampSchema,
    evidenceIds: Vts.array(IdSchema)
}, {objectSchema: {strict: true}});

/**
 * Type of schema Observation.
 */
export type Observation = ExtractSchemaResultType<typeof ObservationSchema>;