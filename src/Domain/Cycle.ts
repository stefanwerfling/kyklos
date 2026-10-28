/**
 * Cycle — a concrete execution of a procedure.
 *
 * An append-only record. References the exact procedure and checklist versions
 * it ran with, so the result is reproducible and auditable.
 */
import {ExtractSchemaResultType, Vts} from 'vts';
import {CycleState, IdSchema, TimestampSchema, VersionSchema} from './Common.js';

/**
 * Schema of Cycle.
 */
export const CycleSchema = Vts.object({
    id: IdSchema,
    projectId: IdSchema,
    procedureId: IdSchema,
    procedureVersion: VersionSchema,
    checklistId: IdSchema,
    checklistVersion: VersionSchema,
    state: Vts.enum(CycleState),
    startedAt: Vts.optional(TimestampSchema),
    endedAt: Vts.optional(TimestampSchema),
    observationIds: Vts.array(IdSchema),
    deviationIds: Vts.array(IdSchema)
}, {objectSchema: {strict: true}});

/**
 * Type of schema Cycle.
 */
export type Cycle = ExtractSchemaResultType<typeof CycleSchema>;