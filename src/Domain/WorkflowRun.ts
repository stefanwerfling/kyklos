/**
 * WorkflowRun & PhaseRun — the append-only record of a workflow execution.
 *
 * The WorkflowRun header is written once at start (immutable). Each executed
 * phase appends one PhaseRun that links to the cycle and plan it produced. The
 * current workflow state is derived from the set of PhaseRuns (not a mutated
 * field), which keeps the store append-only and makes resume possible: a resumed
 * run reads its PhaseRuns and continues only the phases that have not passed.
 */
import {ExtractSchemaResultType, Vts} from 'vts';
import {CycleState, IdSchema, TimestampSchema, VersionSchema} from './Common.js';

/**
 * Schema of WorkflowRun — the run header.
 */
export const WorkflowRunSchema = Vts.object({
    id: IdSchema,
    workflowId: IdSchema,
    workflowVersion: VersionSchema,
    projectId: IdSchema,
    startedAt: TimestampSchema
}, {objectSchema: {strict: true}});

/**
 * Schema of PhaseRun — one executed phase.
 */
export const PhaseRunSchema = Vts.object({
    id: IdSchema,
    workflowRunId: IdSchema,
    phaseId: IdSchema,
    state: Vts.enum(CycleState),
    cycleId: Vts.optional(IdSchema),
    planId: Vts.optional(IdSchema),
    startedAt: TimestampSchema,
    endedAt: TimestampSchema
}, {objectSchema: {strict: true}});

/**
 * Type of schema WorkflowRun.
 */
export type WorkflowRun = ExtractSchemaResultType<typeof WorkflowRunSchema>;

/**
 * Type of schema PhaseRun.
 */
export type PhaseRun = ExtractSchemaResultType<typeof PhaseRunSchema>;