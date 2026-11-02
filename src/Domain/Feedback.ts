/**
 * Feedback — a person's reported result for a manual/delegated task
 * (append-only).
 *
 * The person reports a result and attaches evidence; Kyklos decides completion
 * deterministically from this plus the task's success criteria and evidence
 * requirements — the feedback is a claim, not a status.
 */
import {ExtractSchemaResultType, Vts} from 'vts';
import {FeedbackResult, IdSchema, TimestampSchema} from './Common.js';

/**
 * Schema of Feedback.
 */
export const FeedbackSchema = Vts.object({
    id: IdSchema,
    taskId: IdSchema,
    actorId: IdSchema,
    result: Vts.enum(FeedbackResult),
    note: Vts.optional(Vts.string()),
    evidenceIds: Vts.array(IdSchema),
    timeSpentMinutes: Vts.optional(Vts.number()),
    submittedAt: TimestampSchema
}, {objectSchema: {strict: true}});

/**
 * Type of schema Feedback.
 */
export type Feedback = ExtractSchemaResultType<typeof FeedbackSchema>;