/**
 * Artifact — a content-addressed build output (image, package, archive, file).
 *
 * The artifact's identity is its digest: `id` IS the content digest. Two builds
 * that produce the same digest are the same artifact; a rebuild that yields a
 * different digest is a different artifact and is never treated as identical.
 * This is what lets the tested digest be the deployed digest (verified by
 * ArtifactVerifier), so a silent rebuild cannot swap the released bits.
 */
import {ExtractSchemaResultType, Vts} from 'vts';
import {ArtifactKind, IdSchema, TimestampSchema, VersionSchema} from './Common.js';

/**
 * Schema of a named checksum over the artifact (in addition to the digest id).
 */
export const ArtifactChecksumSchema = Vts.object({
    algorithm: Vts.string({description: 'Checksum algorithm, e.g. sha256, sha512'}),
    value: Vts.string({description: 'Lower-case hex checksum value'})
}, {objectSchema: {strict: true}});

/**
 * Schema of Artifact.
 */
export const ArtifactSchema = Vts.object({
    id: IdSchema,
    kind: Vts.enum(ArtifactKind),
    name: Vts.optional(Vts.string({description: 'Human-facing artifact name, e.g. a repository/image name'})),
    version: Vts.optional(VersionSchema),
    checksums: Vts.optional(Vts.array(ArtifactChecksumSchema)),
    producedByCycleId: Vts.optional(IdSchema),
    createdAt: TimestampSchema
}, {objectSchema: {strict: true}});

/**
 * Type of schema ArtifactChecksum.
 */
export type ArtifactChecksum = ExtractSchemaResultType<typeof ArtifactChecksumSchema>;

/**
 * Type of schema Artifact.
 */
export type Artifact = ExtractSchemaResultType<typeof ArtifactSchema>;