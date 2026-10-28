/**
 * Procedure — a reusable flow or verification process.
 *
 * A versioned definition (id + version). Immutable per version; it references
 * a specific pinned checklist version.
 */
import {ExtractSchemaResultType, Vts} from 'vts';
import {IdSchema, VersionSchema} from './Common.js';

/**
 * Schema of Procedure.
 */
export const ProcedureSchema = Vts.object({
    id: IdSchema,
    version: VersionSchema,
    name: Vts.string({description: 'Human-readable procedure name'}),
    kind: Vts.string({description: 'Procedure kind, e.g. software-release, backup'}),
    description: Vts.optional(Vts.string()),
    checklistId: IdSchema,
    checklistVersion: VersionSchema
}, {objectSchema: {strict: true}});

/**
 * Type of schema Procedure.
 */
export type Procedure = ExtractSchemaResultType<typeof ProcedureSchema>;