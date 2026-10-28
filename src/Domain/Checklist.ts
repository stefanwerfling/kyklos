/**
 * Checklist — a versioned list of mandatory and optional checks.
 *
 * A versioned definition (id + version). Immutable per version; a cycle pins
 * exactly one checklist version.
 */
import {ExtractSchemaResultType, Vts} from 'vts';
import {CheckSchema} from './Check.js';
import {IdSchema, VersionSchema} from './Common.js';

/**
 * Schema of Checklist.
 */
export const ChecklistSchema = Vts.object({
    id: IdSchema,
    version: VersionSchema,
    ruleVersion: VersionSchema,
    checks: Vts.array(CheckSchema)
}, {objectSchema: {strict: true}});

/**
 * Type of schema Checklist.
 */
export type Checklist = ExtractSchemaResultType<typeof ChecklistSchema>;