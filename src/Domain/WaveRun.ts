/**
 * WaveRun & EnvironmentRun — the append-only record of an update-wave rollout.
 *
 * The WaveRun header is written once. Each environment a workflow runs against
 * appends one EnvironmentRun that links to the WorkflowRun it produced and
 * records its derived state and which wave it belonged to. The wave gate and
 * overall rollout state are derived from these records (never a mutated field),
 * which keeps the store append-only and leaves room for a later resume.
 */
import {ExtractSchemaResultType, Vts} from 'vts';
import {CycleState, IdSchema, TimestampSchema, VersionSchema} from './Common.js';

/**
 * Schema of WaveRun — the rollout header.
 */
export const WaveRunSchema = Vts.object({
    id: IdSchema,
    workflowId: IdSchema,
    workflowVersion: VersionSchema,
    projectId: IdSchema,
    startedAt: TimestampSchema
}, {objectSchema: {strict: true}});

/**
 * Schema of EnvironmentRun — one workflow run against one environment.
 */
export const EnvironmentRunSchema = Vts.object({
    id: IdSchema,
    waveRunId: IdSchema,
    waveIndex: Vts.number({description: 'Zero-based index of the wave this environment belonged to'}),
    environmentId: IdSchema,
    workflowRunId: IdSchema,
    state: Vts.enum(CycleState),
    recordedAt: TimestampSchema
}, {objectSchema: {strict: true}});

/**
 * Type of schema WaveRun.
 */
export type WaveRun = ExtractSchemaResultType<typeof WaveRunSchema>;

/**
 * Type of schema EnvironmentRun.
 */
export type EnvironmentRun = ExtractSchemaResultType<typeof EnvironmentRunSchema>;