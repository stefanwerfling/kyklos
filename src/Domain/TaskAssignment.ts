/**
 * TaskAssignment — assigns a task to an actor (append-only).
 */
import {ExtractSchemaResultType, Vts} from 'vts';
import {IdSchema, TimestampSchema} from './Common.js';

/**
 * Schema of TaskAssignment.
 */
export const TaskAssignmentSchema = Vts.object({
    id: IdSchema,
    taskId: IdSchema,
    actorId: IdSchema,
    assignedAt: TimestampSchema,
    dueAt: Vts.optional(TimestampSchema)
}, {objectSchema: {strict: true}});

/**
 * Type of schema TaskAssignment.
 */
export type TaskAssignment = ExtractSchemaResultType<typeof TaskAssignmentSchema>;