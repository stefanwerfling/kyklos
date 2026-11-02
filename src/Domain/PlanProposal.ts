/**
 * PlanProposal — the audit record of an LLM-proposed plan (playbook/workflow).
 *
 * An LLM may propose a whole plan, but the proposal is only ever a suggestion:
 * its origin is an `llm_assertion`, the candidate it points at is stored as a
 * draft (never runnable), and it carries the deterministic validation result.
 * Nothing here is binding — becoming a published, runnable definition is a
 * separate, authorized step (PlanProposalService.publish), never something the
 * LLM or this record can do on its own.
 */
import {ExtractSchemaResultType, Vts} from 'vts';
import {EvidenceSource, IdSchema, PlanKind, ProposalStatus, TimestampSchema, ValidationResult, VersionSchema} from './Common.js';
import {DiagnosticSchema} from './ExecutionPlan.js';

/**
 * Schema of PlanValidation — the deterministic validation of a candidate.
 */
export const PlanValidationSchema = Vts.object({
    result: Vts.enum(ValidationResult),
    diagnostics: Vts.array(DiagnosticSchema),
    method: Vts.optional(Vts.string({description: 'How the candidate was validated'}))
}, {objectSchema: {strict: true}});

/**
 * Schema of PlanProposal.
 */
export const PlanProposalSchema = Vts.object({
    id: IdSchema,
    kind: Vts.enum(PlanKind),
    goal: Vts.string({description: 'What the proposed plan is meant to achieve'}),
    candidateId: IdSchema,
    candidateVersion: VersionSchema,
    origin: Vts.enum(EvidenceSource),
    rationale: Vts.string(),
    validation: PlanValidationSchema,
    status: Vts.enum(ProposalStatus),
    createdAt: TimestampSchema
}, {objectSchema: {strict: true}});

/**
 * Type of schema PlanValidation.
 */
export type PlanValidation = ExtractSchemaResultType<typeof PlanValidationSchema>;

/**
 * Type of schema PlanProposal.
 */
export type PlanProposal = ExtractSchemaResultType<typeof PlanProposalSchema>;