/**
 * Workflow — a versioned, ordered set of phases.
 *
 * A workflow describes WHICH steps happen in WHICH order; each phase runs a
 * playbook/procedure root (the HOW, from W1) as exactly one cycle. Phases form a
 * dependency graph; a phase runs only after its dependencies passed. The
 * workflow never introduces a second execution engine — each phase is executed
 * by the existing PlanExecutor/CycleEngine.
 */
import {ExtractSchemaResultType, Vts} from 'vts';
import {IdSchema, PlaybookStepKind, VersionSchema, WorkflowPhaseRunOn, WorkflowStatus} from './Common.js';

/**
 * Schema of PhaseRoot — the playbook/procedure a phase runs.
 */
export const PhaseRootSchema = Vts.object({
    kind: Vts.enum(PlaybookStepKind),
    id: IdSchema,
    version: VersionSchema
}, {objectSchema: {strict: true}});

/**
 * Schema of WorkflowPhase.
 */
export const WorkflowPhaseSchema = Vts.object({
    id: IdSchema,
    name: Vts.string({description: 'Human-readable phase name'}),
    dependsOn: Vts.array(IdSchema),
    optional: Vts.boolean({description: 'A failed optional phase does not block the workflow'}),
    root: PhaseRootSchema,
    targetSystemId: Vts.optional(IdSchema),
    rollback: Vts.optional(PhaseRootSchema),
    runOn: Vts.optional(Vts.enum(WorkflowPhaseRunOn))
}, {objectSchema: {strict: true}});

/**
 * Schema of Workflow.
 */
export const WorkflowSchema = Vts.object({
    id: IdSchema,
    version: VersionSchema,
    name: Vts.string({description: 'Human-readable workflow name'}),
    description: Vts.optional(Vts.string()),
    status: Vts.enum(WorkflowStatus),
    phases: Vts.array(WorkflowPhaseSchema)
}, {objectSchema: {strict: true}});

/**
 * Type of schema PhaseRoot.
 */
export type PhaseRoot = ExtractSchemaResultType<typeof PhaseRootSchema>;

/**
 * Type of schema WorkflowPhase.
 */
export type WorkflowPhase = ExtractSchemaResultType<typeof WorkflowPhaseSchema>;

/**
 * Type of schema Workflow.
 */
export type Workflow = ExtractSchemaResultType<typeof WorkflowSchema>;