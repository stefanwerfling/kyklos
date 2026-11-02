/**
 * TargetSystem — the concrete system a run targets.
 *
 * Minimal in W1: enough for the playbook resolver to filter candidates by
 * operating system and technologies. A full environment/host registry arrives
 * in a later phase.
 */
import {ExtractSchemaResultType, Vts} from 'vts';
import {IdSchema} from './Common.js';

/**
 * Schema of TargetSystem.
 */
export const TargetSystemSchema = Vts.object({
    id: IdSchema,
    os: Vts.string({description: 'Operating system family, e.g. debian, windows, docker'}),
    osVersion: Vts.optional(Vts.string({description: 'OS version, e.g. 12, 11, server-2022'})),
    technologies: Vts.array(Vts.string({description: 'Technology tag, e.g. nodejs, postgresql'}))
}, {objectSchema: {strict: true}});

/**
 * Type of schema TargetSystem.
 */
export type TargetSystem = ExtractSchemaResultType<typeof TargetSystemSchema>;