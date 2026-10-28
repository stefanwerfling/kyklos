/**
 * ShellAdapter — runs an allow-listed binary with structured arguments.
 *
 * Security by construction: the action carries a bare binary name plus an
 * argument array (never a shell string), so no shell metacharacter can inject.
 * Only binaries on the allow-list run; anything else yields not executable. A
 * timeout kills the child and also yields not executable.
 */
import {spawn} from 'node:child_process';
import {Vts} from 'vts';
import {CheckAction} from '../Domain/Check.js';
import {AdapterKind} from '../Domain/Common.js';
import {Adapter} from './Adapter.js';
import {AdapterOutcome} from './AdapterTypes.js';

const DEFAULT_TIMEOUT_MS = 30000;

const ShellParamsSchema = Vts.object({
    bin: Vts.string(),
    args: Vts.optional(Vts.array(Vts.string())),
    timeoutMs: Vts.optional(Vts.number())
}, {objectSchema: {strict: true}});

/**
 * Options for the shell adapter.
 */
export interface ShellAdapterOptions {

    /**
     * Binary names that are permitted to run.
     * @member {string[]}
     */
    allowlist: string[];

    /**
     * Default timeout in milliseconds when a check does not specify one.
     * @member {number|undefined}
     */
    defaultTimeoutMs?: number;
}

/**
 * Adapter for allow-listed shell commands.
 */
export class ShellAdapter extends Adapter {

    /**
     * The adapter kind this executor handles.
     * @member {AdapterKind}
     */
    public readonly kind: AdapterKind = AdapterKind.Shell;

    /**
     * Allow-listed binary names.
     * @member {Set<string>}
     */
    protected readonly _allowlist: Set<string>;

    /**
     * Default timeout in milliseconds.
     * @member {number}
     */
    protected readonly _defaultTimeoutMs: number;

    /**
     * @param {ShellAdapterOptions} options - Allow-list and default timeout.
     */
    public constructor(options: ShellAdapterOptions) {
        super();
        this._allowlist = new Set(options.allowlist);
        this._defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    }

    /**
     * Execute an allow-listed shell command.
     * @param {CheckAction} action - The shell action with bin/args/timeoutMs params.
     * @returns {Promise<AdapterOutcome>} The raw outcome.
     */
    public async execute(action: CheckAction): Promise<AdapterOutcome> {
        if (!ShellParamsSchema.validate(action.params, [])) {
            return {executed: false, reason: 'invalid_params'};
        }

        const bin = action.params.bin;

        if (!this._allowlist.has(bin)) {
            return {executed: false, reason: `not_allowlisted: ${bin}`};
        }

        const args = action.params.args ?? [];
        const timeoutMs = action.params.timeoutMs ?? this._defaultTimeoutMs;
        return this._spawn(bin, args, timeoutMs);
    }

    /**
     * Spawn a child process without a shell and collect its output.
     * @param {string} bin - The binary to run.
     * @param {string[]} args - Arguments passed to the binary.
     * @param {number} timeoutMs - Kill the child after this many milliseconds.
     * @returns {Promise<AdapterOutcome>} The raw outcome (never rejects).
     */
    protected _spawn(bin: string, args: string[], timeoutMs: number): Promise<AdapterOutcome> {
        return new Promise<AdapterOutcome>((resolve): void => {
            const child = spawn(bin, args, {timeout: timeoutMs});
            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (chunk: Buffer): void => {
                stdout += chunk.toString('utf8');
            });

            child.stderr.on('data', (chunk: Buffer): void => {
                stderr += chunk.toString('utf8');
            });

            child.on('error', (error: Error): void => {
                resolve({executed: false, reason: `spawn_error: ${error.message}`});
            });

            child.on('close', (code: number|null, signal: NodeJS.Signals|null): void => {
                if (code === null) {
                    resolve({executed: false, reason: `timeout: ${signal ?? 'terminated'}`, stdout: stdout, stderr: stderr});
                    return;
                }

                resolve({executed: true, exitCode: code, stdout: stdout, stderr: stderr});
            });
        });
    }

}