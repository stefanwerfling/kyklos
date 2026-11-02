/**
 * Playbook — a versioned, composable procedure definition.
 *
 * A playbook references procedures, other playbooks and checklists, adds
 * metadata (scope, target systems, technologies, prerequisites, rollback,
 * evidence and knowledge references) and compiles down to the existing
 * Checklist/Check model for execution. It never grants permissions and never
 * introduces a second execution engine. `sealed` marks a playbook (or a step)
 * whose security-relevant content a more specific playbook may not weaken.
 */
import {ExtractSchemaResultType, Vts} from 'vts';
import {IdSchema, PlaybookScope, PlaybookStatus, PlaybookStepKind, PlaybookStepRelation, VersionSchema} from './Common.js';

/**
 * Schema of PlaybookStep — a version-pinned reference to a procedure, another
 * playbook, or a checklist.
 */
export const PlaybookStepSchema = Vts.object({
    kind: Vts.enum(PlaybookStepKind),
    id: IdSchema,
    version: VersionSchema,
    relation: Vts.optional(Vts.enum(PlaybookStepRelation)),
    sealed: Vts.optional(Vts.boolean({description: 'Step cannot be weakened/removed by a more specific playbook'}))
}, {objectSchema: {strict: true}});

/**
 * Schema of PlaybookRollback — the playbook to run on failure.
 */
export const PlaybookRollbackSchema = Vts.object({
    playbookId: IdSchema,
    version: VersionSchema
}, {objectSchema: {strict: true}});

/**
 * Schema of KnowledgeRef — a reference to a knowledge entry (resolution of
 * knowledge arrives in a later phase; W1 only models the reference).
 */
export const KnowledgeRefSchema = Vts.object({
    scope: Vts.enum(PlaybookScope),
    id: IdSchema
}, {objectSchema: {strict: true}});

/**
 * Schema of Playbook.
 */
export const PlaybookSchema = Vts.object({
    id: IdSchema,
    version: VersionSchema,
    name: Vts.string({description: 'Human-readable playbook name'}),
    description: Vts.optional(Vts.string()),
    status: Vts.enum(PlaybookStatus),
    scope: Vts.enum(PlaybookScope),
    targetSystems: Vts.array(Vts.string({description: 'OS family or id this playbook applies to'})),
    technologies: Vts.array(Vts.string()),
    prerequisites: Vts.array(Vts.string({description: 'Declarative prerequisite (evaluation arrives later)'})),
    steps: Vts.array(PlaybookStepSchema),
    successCriteria: Vts.optional(Vts.array(Vts.string())),
    rollback: Vts.optional(PlaybookRollbackSchema),
    evidenceRequirements: Vts.optional(Vts.array(Vts.string())),
    knowledgeRefs: Vts.optional(Vts.array(KnowledgeRefSchema)),
    sealed: Vts.boolean({description: 'Whole playbook is a security rule a more specific playbook may not weaken'})
}, {objectSchema: {strict: true}});

/**
 * Type of schema PlaybookStep.
 */
export type PlaybookStep = ExtractSchemaResultType<typeof PlaybookStepSchema>;

/**
 * Type of schema Playbook.
 */
export type Playbook = ExtractSchemaResultType<typeof PlaybookSchema>;