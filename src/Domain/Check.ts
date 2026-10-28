/**
 * Check — a single check step with preconditions, an action and a success
 * criterion.
 *
 * A versioned definition (id + version). The action is executed by an adapter
 * (manual/shell/http/decision); its params stay flexible and are validated by
 * the adapter at execution time (M2), not by this structural schema.
 */
import {ExtractSchemaResultType, Vts} from 'vts';
import {AdapterKind, Criticality, IdSchema, OnFailure, VersionSchema} from './Common.js';

/**
 * Schema of CheckAction.
 */
export const CheckActionSchema = Vts.object({
    adapter: Vts.enum(AdapterKind),
    params: Vts.optional(Vts.unknown())
}, {objectSchema: {strict: true}});

/**
 * Schema of SuccessCriterion.
 */
export const SuccessCriterionSchema = Vts.object({
    kind: Vts.string({description: 'Criterion kind, e.g. exitZero, httpStatus, regex'}),
    params: Vts.optional(Vts.unknown())
}, {objectSchema: {strict: true}});

/**
 * Schema of Check.
 */
export const CheckSchema = Vts.object({
    id: IdSchema,
    version: VersionSchema,
    group: Vts.string({description: 'Check group, e.g. preparation, backup, upgrade'}),
    description: Vts.string(),
    criticality: Vts.enum(Criticality),
    preconditions: Vts.array(Vts.string({description: 'Precondition expression'})),
    action: CheckActionSchema,
    successCriterion: SuccessCriterionSchema,
    expectedEvidence: Vts.array(Vts.string()),
    onFailure: Vts.enum(OnFailure)
}, {objectSchema: {strict: true}});

/**
 * Type of schema CheckAction.
 */
export type CheckAction = ExtractSchemaResultType<typeof CheckActionSchema>;

/**
 * Type of schema SuccessCriterion.
 */
export type SuccessCriterion = ExtractSchemaResultType<typeof SuccessCriterionSchema>;

/**
 * Type of schema Check.
 */
export type Check = ExtractSchemaResultType<typeof CheckSchema>;