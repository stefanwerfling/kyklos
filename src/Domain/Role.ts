/**
 * Role — a named, versioned set of capabilities with a permission ceiling.
 *
 * An Actor holds role ids (Actor.roles); a Role says what those ids actually
 * grant: which capabilities and the highest permission tier the holder may act
 * at. Roles are immutable versioned definitions, so an authorization decision
 * is reproducible. The AuthorizationService resolves an actor's roles to the
 * union of their capabilities — unknown roles grant nothing (fail-closed).
 */
import {ExtractSchemaResultType, Vts} from 'vts';
import {Capability, IdSchema, PermissionTier, VersionSchema} from './Common.js';

/**
 * Schema of Role.
 */
export const RoleSchema = Vts.object({
    id: IdSchema,
    version: VersionSchema,
    name: Vts.string({description: 'Human-facing role name, e.g. "Release approver"'}),
    capabilities: Vts.array(Vts.enum(Capability)),
    maxTier: Vts.enum(PermissionTier)
}, {objectSchema: {strict: true}});

/**
 * Type of schema Role.
 */
export type Role = ExtractSchemaResultType<typeof RoleSchema>;