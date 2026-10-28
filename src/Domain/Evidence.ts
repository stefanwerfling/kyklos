/**
 * Evidence — a verifiable proof for an observation or decision.
 *
 * An append-only record. The sha256 checksum pins the content so evidence
 * cannot be silently altered.
 */
import {ExtractSchemaResultType, Vts} from 'vts';
import {EvidenceType, IdSchema, Sha256Schema, TimestampSchema} from './Common.js';

/**
 * Schema of Evidence.
 */
export const EvidenceSchema = Vts.object({
    id: IdSchema,
    type: Vts.enum(EvidenceType),
    uri: Vts.optional(Vts.string({description: 'Location of the external evidence content'})),
    inline: Vts.optional(Vts.string({description: 'Inline evidence content'})),
    sha256: Sha256Schema,
    producedBy: Vts.string({description: 'Check or process that produced this evidence'}),
    createdAt: TimestampSchema
}, {objectSchema: {strict: true}});

/**
 * Type of schema Evidence.
 */
export type Evidence = ExtractSchemaResultType<typeof EvidenceSchema>;