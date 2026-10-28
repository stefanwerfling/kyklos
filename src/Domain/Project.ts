/**
 * Project — project identity and technical properties.
 *
 * Identified by a stable id. Persistent and editable (not versioned).
 */
import {ExtractSchemaResultType, Vts} from 'vts';
import {IdSchema} from './Common.js';

/**
 * Schema of Project.
 */
export const ProjectSchema = Vts.object({
    id: IdSchema,
    name: Vts.string({description: 'Human-readable project name'}),
    repoUrl: Vts.optional(Vts.string({description: 'Source repository URL'})),
    stack: Vts.array(Vts.string({description: 'Technology tag, e.g. postgresql, node'})),
    tags: Vts.array(Vts.string()),
    policyRefs: Vts.array(Vts.string({description: 'References to applicable policies'}))
}, {objectSchema: {strict: true}});

/**
 * Type of schema Project.
 */
export type Project = ExtractSchemaResultType<typeof ProjectSchema>;