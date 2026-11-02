/**
 * Approval — an authorized decision on an approval task (append-only).
 *
 * An approval records who decided, the role they acted under, and the outcome.
 * It is the authorized evidence that replaces a self-declared decider string in
 * release decisions.
 */
import {ExtractSchemaResultType, Vts} from 'vts';
import {ApprovalDecision, IdSchema, TimestampSchema} from './Common.js';

/**
 * Schema of Approval.
 */
export const ApprovalSchema = Vts.object({
    id: IdSchema,
    taskId: IdSchema,
    actorId: IdSchema,
    decision: Vts.enum(ApprovalDecision),
    rationale: Vts.string(),
    role: Vts.string({description: 'Role the actor approved under'}),
    decidedAt: TimestampSchema
}, {objectSchema: {strict: true}});

/**
 * Type of schema Approval.
 */
export type Approval = ExtractSchemaResultType<typeof ApprovalSchema>;