/**
 * Incident — a correlated failure or problem case grouped from deviations.
 *
 * In the MVP the root cause is only a free-text field plus a separated
 * confidence level (RootCauseHypothesis becomes its own entity later).
 */
import {ExtractSchemaResultType, Vts} from 'vts';
import {Confidence, IdSchema, IncidentStatus, TimestampSchema} from './Common.js';

/**
 * Schema of Incident.
 */
export const IncidentSchema = Vts.object({
    id: IdSchema,
    cycleId: Vts.optional(IdSchema),
    deviationIds: Vts.array(IdSchema),
    classification: Vts.string({description: 'Technical classification, e.g. backup/restore'}),
    signature: Vts.string({description: 'Deterministic fingerprint for similarity matching'}),
    status: Vts.enum(IncidentStatus),
    confidence: Vts.enum(Confidence),
    rootCause: Vts.optional(Vts.string({description: 'Free-text root cause (MVP)'})),
    createdAt: TimestampSchema
}, {objectSchema: {strict: true}});

/**
 * Type of schema Incident.
 */
export type Incident = ExtractSchemaResultType<typeof IncidentSchema>;