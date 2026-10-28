/**
 * ToolExecution — the concrete record every tool-produced result traces back
 * to.
 *
 * It captures what ran (adapter, command, permission tier), how it ended
 * (status, exit code, timing) and the output, with sha256 over the full
 * stdout/stderr so a truncated display never loses integrity. An append-only
 * record.
 */
import {ExtractSchemaResultType, Vts} from 'vts';
import {AdapterKind, CheckStatus, IdSchema, PermissionTier, Sha256Schema, TimestampSchema} from './Common.js';

/**
 * Schema of ToolExecution.
 */
export const ToolExecutionSchema = Vts.object({
    id: IdSchema,
    cycleId: Vts.optional(IdSchema),
    checkId: Vts.optional(IdSchema),
    adapter: Vts.enum(AdapterKind),
    permissionTier: Vts.enum(PermissionTier),
    command: Vts.string({description: 'Human-readable command that was run'}),
    status: Vts.enum(CheckStatus),
    exitCode: Vts.optional(Vts.number()),
    startedAt: TimestampSchema,
    endedAt: TimestampSchema,
    durationMs: Vts.number(),
    stdout: Vts.string({description: 'Truncated standard output for display'}),
    stderr: Vts.string({description: 'Truncated standard error for display'}),
    stdoutSha256: Sha256Schema,
    stderrSha256: Sha256Schema
}, {objectSchema: {strict: true}});

/**
 * Type of schema ToolExecution.
 */
export type ToolExecution = ExtractSchemaResultType<typeof ToolExecutionSchema>;