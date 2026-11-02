/**
 * ManualConfirmation — an operator's attributed confirmation of a manual check.
 *
 * A manual check passes only when a human confirms it; this append-only record
 * says who confirmed which check, when, and why. It is what keeps a manual
 * confirmation from being an anonymous flag: the boolean that lets the check
 * pass is always backed by a persisted, attributable record.
 */
import {ExtractSchemaResultType, Vts} from 'vts';
import {IdSchema, TimestampSchema} from './Common.js';

/**
 * Schema of ManualConfirmation.
 */
export const ManualConfirmationSchema = Vts.object({
    id: IdSchema,
    checkId: IdSchema,
    confirmedBy: Vts.string({description: 'Who confirmed the manual check'}),
    note: Vts.optional(Vts.string({description: 'What was done / evidence reference'})),
    confirmedAt: TimestampSchema
}, {objectSchema: {strict: true}});

/**
 * Type of schema ManualConfirmation.
 */
export type ManualConfirmation = ExtractSchemaResultType<typeof ManualConfirmationSchema>;