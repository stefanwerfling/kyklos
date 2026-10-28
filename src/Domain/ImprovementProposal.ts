/**
 * ImprovementProposal — a proposed change to a checklist or check.
 *
 * A proposal is only ever a suggestion; it never auto-activates. In the MVP
 * the validation is a mandatory embedded field: a proposal can only be
 * accepted once its validation result is "passed" (enforced by the cycle
 * engine in M6, structurally prepared here).
 */
import {ExtractSchemaResultType, Vts} from 'vts';
import {IdSchema, ProposalStatus, ProposalTargetType, TimestampSchema, ValidationResult} from './Common.js';

/**
 * Schema of ProposalValidation.
 */
export const ProposalValidationSchema = Vts.object({
    result: Vts.enum(ValidationResult),
    method: Vts.optional(Vts.string({description: 'How the proposal was validated'})),
    evidenceIds: Vts.array(IdSchema)
}, {objectSchema: {strict: true}});

/**
 * Schema of ImprovementProposal.
 */
export const ImprovementProposalSchema = Vts.object({
    id: IdSchema,
    incidentId: Vts.optional(IdSchema),
    targetType: Vts.enum(ProposalTargetType),
    targetId: IdSchema,
    rationale: Vts.string(),
    diff: Vts.string({description: 'Human-readable proposed change'}),
    status: Vts.enum(ProposalStatus),
    validation: ProposalValidationSchema,
    createdAt: TimestampSchema
}, {objectSchema: {strict: true}});

/**
 * Type of schema ProposalValidation.
 */
export type ProposalValidation = ExtractSchemaResultType<typeof ProposalValidationSchema>;

/**
 * Type of schema ImprovementProposal.
 */
export type ImprovementProposal = ExtractSchemaResultType<typeof ImprovementProposalSchema>;