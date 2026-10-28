/**
 * Lesson — a confirmed, reusable insight derived from experience.
 *
 * A versioned definition (id + version). A lesson records where it came from
 * (provenance), the technologies and conditions under which it applies, its
 * known limits, and which content categories must never be transferred
 * (excludes). Cross-project transfer only happens when the conditions are
 * checked in the target project (see LessonTransfer).
 */
import {ExtractSchemaResultType, Vts} from 'vts';
import {IdSchema, LessonScope, LessonStatus, VersionSchema} from './Common.js';

/**
 * Schema of LessonAppliesTo.
 */
export const LessonAppliesToSchema = Vts.object({
    tech: Vts.array(Vts.string({description: 'Technology tag, e.g. postgresql'})),
    procedureKind: Vts.array(Vts.string())
}, {objectSchema: {strict: true}});

/**
 * Schema of LessonProvenance.
 */
export const LessonProvenanceSchema = Vts.object({
    originProject: Vts.string(),
    incidentSignature: Vts.optional(Vts.string())
}, {objectSchema: {strict: true}});

/**
 * Schema of Lesson.
 */
export const LessonSchema = Vts.object({
    id: IdSchema,
    version: VersionSchema,
    scope: Vts.enum(LessonScope),
    statement: Vts.string(),
    appliesTo: LessonAppliesToSchema,
    conditions: Vts.array(Vts.string({description: 'Condition that must hold in the target project'})),
    knownLimits: Vts.array(Vts.string()),
    provenance: LessonProvenanceSchema,
    validationStatus: Vts.enum(LessonStatus),
    excludes: Vts.array(Vts.string({description: 'Content category that must never be transferred'}))
}, {objectSchema: {strict: true}});

/**
 * Type of schema LessonAppliesTo.
 */
export type LessonAppliesTo = ExtractSchemaResultType<typeof LessonAppliesToSchema>;

/**
 * Type of schema LessonProvenance.
 */
export type LessonProvenance = ExtractSchemaResultType<typeof LessonProvenanceSchema>;

/**
 * Type of schema Lesson.
 */
export type Lesson = ExtractSchemaResultType<typeof LessonSchema>;