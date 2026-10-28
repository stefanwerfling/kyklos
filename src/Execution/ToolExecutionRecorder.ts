/**
 * ToolExecutionRecorder — builds a ToolExecution record from a finished run.
 *
 * Output is truncated for display, but the sha256 is taken over the full
 * stdout/stderr, so the record stays integrity-checkable even when shortened.
 */
import {AdapterKind, CheckStatus, PermissionTier} from '../Domain/Common.js';
import {ToolExecution} from '../Domain/ToolExecution.js';
import {Checksum} from '../Serialization/Checksum.js';

const MAX_OUTPUT_CHARS = 4000;

/**
 * The raw inputs needed to record a tool execution.
 */
export interface ToolExecutionInput {

    /**
     * Execution id.
     * @member {string}
     */
    id: string;

    /**
     * Adapter that ran the command.
     * @member {AdapterKind}
     */
    adapter: AdapterKind;

    /**
     * Permission tier the action acted at.
     * @member {PermissionTier}
     */
    permissionTier: PermissionTier;

    /**
     * Human-readable command.
     * @member {string}
     */
    command: string;

    /**
     * Mapped check status of the run.
     * @member {CheckStatus}
     */
    status: CheckStatus;

    /**
     * Full standard output.
     * @member {string}
     */
    stdout: string;

    /**
     * Full standard error.
     * @member {string}
     */
    stderr: string;

    /**
     * Start timestamp (ISO).
     * @member {string}
     */
    startedAt: string;

    /**
     * End timestamp (ISO).
     * @member {string}
     */
    endedAt: string;

    /**
     * Wall-clock duration in milliseconds.
     * @member {number}
     */
    durationMs: number;

    /**
     * Exit code, when a process exited.
     * @member {number|undefined}
     */
    exitCode?: number;

    /**
     * Owning cycle id, if any.
     * @member {string|undefined}
     */
    cycleId?: string;

    /**
     * Owning check id, if any.
     * @member {string|undefined}
     */
    checkId?: string;
}

/**
 * Static builder of tool-execution records.
 */
export class ToolExecutionRecorder {

    /**
     * Build a ToolExecution from raw run inputs.
     * @param {ToolExecutionInput} input - The finished run's inputs.
     * @returns {ToolExecution} The execution record (output truncated, hashed in full).
     */
    public static record(input: ToolExecutionInput): ToolExecution {
        return {
            id: input.id,
            cycleId: input.cycleId,
            checkId: input.checkId,
            adapter: input.adapter,
            permissionTier: input.permissionTier,
            command: input.command,
            status: input.status,
            exitCode: input.exitCode,
            startedAt: input.startedAt,
            endedAt: input.endedAt,
            durationMs: input.durationMs,
            stdout: ToolExecutionRecorder._truncate(input.stdout),
            stderr: ToolExecutionRecorder._truncate(input.stderr),
            stdoutSha256: Checksum.sha256Hex(input.stdout),
            stderrSha256: Checksum.sha256Hex(input.stderr)
        };
    }

    /**
     * Truncate text for display, noting how much was dropped.
     * @param {string} text - The full text.
     * @returns {string} The display text.
     */
    protected static _truncate(text: string): string {
        if (text.length <= MAX_OUTPUT_CHARS) {
            return text;
        }

        const dropped = text.length - MAX_OUTPUT_CHARS;
        return `${text.slice(0, MAX_OUTPUT_CHARS)}... [truncated ${dropped} chars]`;
    }

}