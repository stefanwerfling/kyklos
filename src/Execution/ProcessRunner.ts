/**
 * ProcessRunner — runs one CLI check and records a concrete ToolExecution.
 *
 * It brackets the adapter call with the injected clock to measure duration,
 * maps the outcome to a check status (a non-executed run is not_executable,
 * never passed), and produces an append-only execution record every result can
 * be traced back to.
 */
import {Check} from '../Domain/Check.js';
import {CheckStatus, PermissionTier} from '../Domain/Common.js';
import {ToolExecution} from '../Domain/ToolExecution.js';
import {Clock} from '../Cycle/Clock.js';
import {IdGenerator} from '../Cycle/IdGenerator.js';
import {Adapter} from '../Runner/Adapter.js';
import {SuccessCriterionEvaluator} from '../Runner/SuccessCriterionEvaluator.js';
import {ToolExecutionRecorder} from './ToolExecutionRecorder.js';

/**
 * The status plus the execution record of a single CLI run.
 */
export interface ProcessRunResult {

    /**
     * The mapped check status.
     * @member {CheckStatus}
     */
    status: CheckStatus;

    /**
     * The concrete execution record.
     * @member {ToolExecution}
     */
    execution: ToolExecution;
}

/**
 * Runs CLI checks and records their executions.
 */
export class ProcessRunner {

    /**
     * Adapter that executes the command.
     * @member {Adapter}
     */
    protected readonly _adapter: Adapter;

    /**
     * Injected clock.
     * @member {Clock}
     */
    protected readonly _clock: Clock;

    /**
     * Injected id source.
     * @member {IdGenerator}
     */
    protected readonly _idGenerator: IdGenerator;

    /**
     * @param {Adapter} adapter - Adapter used to execute the check action.
     * @param {Clock} clock - Injected clock.
     * @param {IdGenerator} idGenerator - Injected id source.
     */
    public constructor(adapter: Adapter, clock: Clock, idGenerator: IdGenerator) {
        this._adapter = adapter;
        this._clock = clock;
        this._idGenerator = idGenerator;
    }

    /**
     * Run a CLI check and record its execution.
     * @param {Check} check - The check to run.
     * @param {PermissionTier} permissionTier - The tier the action acts at.
     * @param {string} [cycleId] - Owning cycle id, if any.
     * @returns {Promise<ProcessRunResult>} The status and execution record.
     */
    public async run(check: Check, permissionTier: PermissionTier, cycleId?: string): Promise<ProcessRunResult> {
        const startedAt = this._clock.now();
        const outcome = await this._adapter.execute(check.action);
        const endedAt = this._clock.now();

        const status = outcome.executed
            ? SuccessCriterionEvaluator.evaluate(check.successCriterion, outcome).status
            : CheckStatus.NotExecutable;

        const execution = ToolExecutionRecorder.record({
            id: this._idGenerator.next('exec'),
            adapter: this._adapter.kind,
            permissionTier: permissionTier,
            command: ProcessRunner._command(check),
            status: status,
            exitCode: outcome.exitCode,
            startedAt: startedAt,
            endedAt: endedAt,
            durationMs: ProcessRunner._durationMs(startedAt, endedAt),
            stdout: outcome.stdout ?? '',
            stderr: outcome.stderr ?? '',
            cycleId: cycleId,
            checkId: check.id
        });

        return {status: status, execution: execution};
    }

    /**
     * Derive a readable command string from a check's action.
     * @param {Check} check - The check.
     * @returns {string} A readable command, or the check id as a fallback.
     */
    protected static _command(check: Check): string {
        const params = check.action.params;

        if (params !== null && typeof params === 'object' && 'bin' in params) {
            const shell = params as {bin?: unknown; args?: unknown;};
            const bin = typeof shell.bin === 'string' ? shell.bin : '';
            const args = Array.isArray(shell.args) ? shell.args.filter((arg): boolean => typeof arg === 'string').join(' ') : '';
            return `${bin} ${args}`.trim();
        }

        return check.id;
    }

    /**
     * Compute the duration between two ISO timestamps.
     * @param {string} startedAt - Start timestamp.
     * @param {string} endedAt - End timestamp.
     * @returns {number} Duration in milliseconds (never negative).
     */
    protected static _durationMs(startedAt: string, endedAt: string): number {
        const delta = new Date(endedAt).getTime() - new Date(startedAt).getTime();
        return delta > 0 ? delta : 0;
    }

}