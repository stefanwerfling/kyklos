/**
 * Diagnosis — structured root-cause analysis for an incident.
 *
 * It separates hypotheses (each with its confidence and backing evidence) from
 * the incident's free-text summary, so a plausible hypothesis is never confused
 * with a confirmed cause. An append-only record linked to its incident.
 */
import {ExtractSchemaResultType, Vts} from 'vts';
import {Confidence, IdSchema, TimestampSchema} from './Common.js';

/**
 * Schema of Hypothesis — one possible cause with confidence and evidence.
 */
export const HypothesisSchema = Vts.object({
    statement: Vts.string(),
    confidence: Vts.enum(Confidence),
    evidenceIds: Vts.array(IdSchema)
}, {objectSchema: {strict: true}});

/**
 * Schema of Diagnosis.
 */
export const DiagnosisSchema = Vts.object({
    id: IdSchema,
    incidentId: IdSchema,
    hypotheses: Vts.array(HypothesisSchema),
    chosenHypothesisIndex: Vts.optional(Vts.number()),
    createdAt: TimestampSchema
}, {objectSchema: {strict: true}});

/**
 * Type of schema Hypothesis.
 */
export type Hypothesis = ExtractSchemaResultType<typeof HypothesisSchema>;

/**
 * Type of schema Diagnosis.
 */
export type Diagnosis = ExtractSchemaResultType<typeof DiagnosisSchema>;