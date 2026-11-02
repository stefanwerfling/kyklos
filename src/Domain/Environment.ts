/**
 * Environment — a concrete instance a workflow can run against.
 *
 * It names a target (test, staging, production) and points at the TargetSystem
 * (W1) that describes its OS and technologies. Environments are what update
 * waves roll a workflow across; the registry keeps them so a run can address a
 * known environment rather than an ad-hoc target.
 */
import {ExtractSchemaResultType, Vts} from 'vts';
import {EnvironmentKind, IdSchema} from './Common.js';

/**
 * Schema of Environment.
 */
export const EnvironmentSchema = Vts.object({
    id: IdSchema,
    name: Vts.string({description: 'Human-facing environment name, e.g. "prod-eu-1"'}),
    kind: Vts.enum(EnvironmentKind),
    targetSystemId: IdSchema,
    labels: Vts.optional(Vts.array(Vts.string({description: 'Free grouping label, e.g. "canary", "region:eu"'}))),
    address: Vts.optional(Vts.string({description: 'Opaque address/handle; never a secret or credential'}))
}, {objectSchema: {strict: true}});

/**
 * Type of schema Environment.
 */
export type Environment = ExtractSchemaResultType<typeof EnvironmentSchema>;