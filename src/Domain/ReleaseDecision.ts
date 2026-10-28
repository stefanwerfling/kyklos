/**
 * ReleaseDecision — a traceable approve/reject/abort decision.
 *
 * An immutable record. Records the rule version in force, who decided, and any
 * authorized overrides, so the decision stays auditable.
 */
import {ExtractSchemaResultType, Vts} from 'vts';
import {IdSchema, ReleaseOutcome, TimestampSchema, VersionSchema} from './Common.js';

/**
 * Schema of ReleaseDecision.
 */
export const ReleaseDecisionSchema = Vts.object({
    id: IdSchema,
    cycleId: IdSchema,
    outcome: Vts.enum(ReleaseOutcome),
    rationale: Vts.string(),
    ruleVersion: VersionSchema,
    decidedBy: Vts.string({description: 'Identity of the authorized decider'}),
    overrides: Vts.array(Vts.string({description: 'Justified override of a critical deviation'})),
    decidedAt: TimestampSchema,
    evidenceIds: Vts.array(IdSchema)
}, {objectSchema: {strict: true}});

/**
 * Type of schema ReleaseDecision.
 */
export type ReleaseDecision = ExtractSchemaResultType<typeof ReleaseDecisionSchema>;