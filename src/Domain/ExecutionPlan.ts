/**
 * ExecutionPlan — the provenance record a playbook/procedure run traces back to.
 *
 * An append-only record. It captures the exact resolved definitions and their
 * versions, the per-check origin, the compiled (flattened) checks, and the
 * diagnostics from resolution. The compiled checks are embedded here (not stored
 * as an immutable definition), so the same playbook resolved for different
 * target systems never collides. Linked to its cycle by `cycleId`.
 */
import {ExtractSchemaResultType, Vts} from 'vts';
import {CheckSchema} from './Check.js';
import {DiagnosticKind, IdSchema, PlaybookScope, PlaybookStepKind, TimestampSchema, VersionSchema} from './Common.js';

/**
 * Schema of ResolvedEntry — one definition the resolution pulled in.
 */
export const ResolvedEntrySchema = Vts.object({
    kind: Vts.enum(PlaybookStepKind),
    id: IdSchema,
    version: VersionSchema,
    level: Vts.enum(PlaybookScope)
}, {objectSchema: {strict: true}});

/**
 * Schema of CheckProvenance — which source a compiled check came from.
 */
export const CheckProvenanceSchema = Vts.object({
    checkId: IdSchema,
    sourceKind: Vts.enum(PlaybookStepKind),
    sourceId: IdSchema,
    sourceVersion: VersionSchema,
    level: Vts.enum(PlaybookScope)
}, {objectSchema: {strict: true}});

/**
 * Schema of Diagnostic — a resolution/compilation finding.
 */
export const DiagnosticSchema = Vts.object({
    kind: Vts.enum(DiagnosticKind),
    message: Vts.string(),
    ref: Vts.optional(Vts.string({description: 'Related id@version or check id'}))
}, {objectSchema: {strict: true}});

/**
 * Schema of ExecutionPlan.
 */
export const ExecutionPlanSchema = Vts.object({
    id: IdSchema,
    createdAt: TimestampSchema,
    projectId: IdSchema,
    rootKind: Vts.enum(PlaybookStepKind),
    rootId: IdSchema,
    rootVersion: VersionSchema,
    targetSystemId: Vts.optional(IdSchema),
    resolved: Vts.array(ResolvedEntrySchema),
    checkProvenance: Vts.array(CheckProvenanceSchema),
    compiledChecks: Vts.array(CheckSchema),
    diagnostics: Vts.array(DiagnosticSchema),
    cycleId: Vts.optional(IdSchema)
}, {objectSchema: {strict: true}});

/**
 * Type of schema ResolvedEntry.
 */
export type ResolvedEntry = ExtractSchemaResultType<typeof ResolvedEntrySchema>;

/**
 * Type of schema CheckProvenance.
 */
export type CheckProvenance = ExtractSchemaResultType<typeof CheckProvenanceSchema>;

/**
 * Type of schema Diagnostic.
 */
export type Diagnostic = ExtractSchemaResultType<typeof DiagnosticSchema>;

/**
 * Type of schema ExecutionPlan.
 */
export type ExecutionPlan = ExtractSchemaResultType<typeof ExecutionPlanSchema>;