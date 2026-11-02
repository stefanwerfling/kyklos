/**
 * Task — a unit of work with an execution mode.
 *
 * The immutable header of a work item. `automatic` tasks reference a check and
 * reuse the existing runner; `manual`/`delegated` tasks require validated
 * feedback; `approval` tasks require an authorized approval; `llm_assisted`
 * tasks only produce advisory evidence. The current lifecycle state is derived
 * from the task's append-only assignment/feedback/approval records, never set by
 * a bare flag.
 */
import {ExtractSchemaResultType, Vts} from 'vts';
import {IdSchema, PermissionTier, TaskMode, TimestampSchema, VersionSchema} from './Common.js';

/**
 * Schema of CheckRef — a version-pinned reference to a check (automatic mode).
 */
export const CheckRefSchema = Vts.object({
    id: IdSchema,
    version: VersionSchema
}, {objectSchema: {strict: true}});

/**
 * Schema of Task.
 */
export const TaskSchema = Vts.object({
    id: IdSchema,
    mode: Vts.enum(TaskMode),
    description: Vts.string(),
    goal: Vts.optional(Vts.string()),
    instructions: Vts.optional(Vts.string()),
    successCriteria: Vts.array(Vts.string()),
    evidenceRequirements: Vts.array(Vts.string({description: 'Evidence category the completion must provide'})),
    permissionTier: Vts.optional(Vts.enum(PermissionTier)),
    checkRef: Vts.optional(CheckRefSchema),
    assigneeRole: Vts.optional(Vts.string({description: 'Role required to act on this task'})),
    createdAt: TimestampSchema
}, {objectSchema: {strict: true}});

/**
 * Type of schema CheckRef.
 */
export type CheckRef = ExtractSchemaResultType<typeof CheckRefSchema>;

/**
 * Type of schema Task.
 */
export type Task = ExtractSchemaResultType<typeof TaskSchema>;