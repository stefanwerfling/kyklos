/**
 * Actor — a minimal identity with roles.
 *
 * W3 only needs enough to attribute assignments, feedback and approvals and to
 * check a required role. A full identity/RBAC system is a later phase.
 */
import {ExtractSchemaResultType, Vts} from 'vts';
import {IdSchema} from './Common.js';

/**
 * Schema of Actor.
 */
export const ActorSchema = Vts.object({
    id: IdSchema,
    name: Vts.string({description: 'Human-readable actor name'}),
    roles: Vts.array(Vts.string({description: 'Role the actor holds, e.g. release-approver'}))
}, {objectSchema: {strict: true}});

/**
 * Type of schema Actor.
 */
export type Actor = ExtractSchemaResultType<typeof ActorSchema>;