/**
 * ProcessRunner — runs one check through the CheckRunner and records a concrete
 * ToolExecution.
 *
 * Status comes solely from the CheckRunner (and its SuccessCriterionEvaluator),
 * so there is no second status logic. The required permission tier is taken from
 * the trusted action definition (not from the caller), enforced fail-closed by
 * an optional policy: a denied action is recorded not_executable without running.
 * Timing brackets the run via the injected clock.
 */
import {Check} from '../Domain/Check.js';
import {CheckStatus, PermissionTier} from '../Domain/Common.js';
import {ToolExecution} from '../Domain/ToolExecution.js';
import {Clock} from '../Cycle/Clock.js';
import {IdGenerator} from '../Cycle/IdGenerator.js';
import {AdapterOutcome, RunOptions} from '../Runner/AdapterTypes.js';
import {CheckRunner} from '../Runner/CheckRunner.js';
import {PermissionPolicy} from '../Security/PermissionPolicy.js';
import {ToolExecutionRecorder} from './ToolExecutionRecorder.js';

const DEFAULT_TIER = PermissionTier.TempTest;

/**
 * The status plus the execution record of a single run.
 */
export interface ProcessRunResult {

    /**
     * The mapped check status.
     * @member {CheckStatus}
     */
    status: CheckStatus;

    /**
     * The reason for the status.
     * @member {string}
     */
    reason: string;

    /**
     * The raw adapter outcome, when the action was executed.
     * @member {AdapterOutcome|undefined}
     */
    outcome?: AdapterOutcome;

    /**
     * The concrete execution record.
     * @member {ToolExecution}
     */
    execution: ToolExecution;
}

/**
 * Runs checks via the CheckRunner and records their executions.
 */
export class ProcessRunner {

    /**
     * The status authority.
     * @member {CheckRunner}
     */
    protected readonly _runner: CheckRunner;

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
     * Optional permission policy enforced before executing.
     * @member {PermissionPolicy|undefined}
     */
    protected readonly _policy: PermissionPolicy|undefined;

    /**
     * @param {CheckRunner} runner - The single status authority.
     * @param {Clock} clock - Injected clock.
     * @param {IdGenerator} idGenerator - Injected id source.
     * @param {PermissionPolicy} [policy] - Optional permission ceiling enforced before running.
     */
    public constructor(runner: CheckRunner, clock: Clock, idGenerator: IdGenerator, policy?: PermissionPolicy) {
        this._runner = runner;
        this._clock = clock;
        this._idGenerator = idGenerator;
        this._policy = policy;
    }

    /**
     * Run a check, enforce permissions, and record the execution.
     * @param {Check} check - The check to run.
     * @param {RunOptions} [options] - Skip / applicability controls.
     * @param {string} [cycleId] - Owning cycle id, if any.
     * @returns {Promise<ProcessRunResult>} The status, outcome and execution record.
     */
    public async run(check: Check, options?: RunOptions, cycleId?: string): Promise<ProcessRunResult> {
        const tier = check.action.permissionTier ?? DEFAULT_TIER;
        const startedAt = this._clock.now();

        if (this._policy !== undefined && !this._policy.allows(tier)) {
            return this._denied(check, tier, startedAt, cycleId);
        }

        const result = await this._runner.run(check, options);
        const endedAt = this._clock.now();
        const outcome = result.outcome;

        const execution = ToolExecutionRecorder.record({
            id: this._idGenerator.next('exec'),
            adapter: check.action.adapter,
            permissionTier: tier,
            command: ProcessRunner._command(check),
            status: result.status,
            exitCode: outcome?.exitCode,
            startedAt: startedAt,
            endedAt: endedAt,
            durationMs: ProcessRunner._durationMs(startedAt, endedAt),
            stdout: outcome?.stdout ?? '',
            stderr: outcome?.stderr ?? '',
            outputTruncated: outcome?.outputTruncated,
            cycleId: cycleId,
            checkId: check.id
        });

        return {status: result.status, reason: result.reason, outcome: outcome, execution: execution};
    }

    /**
     * Record a permission-denied run as not_executable, without executing.
     * @param {Check} check - The check that was denied.
     * @param {PermissionTier} tier - The required tier that exceeded the policy.
     * @param {string} startedAt - Start timestamp.
     * @param {string} [cycleId] - Owning cycle id, if any.
     * @returns {ProcessRunResult} A not_executable result and its record.
     */
    protected _denied(check: Check, tier: PermissionTier, startedAt: string, cycleId?: string): ProcessRunResult {
        const execution = ToolExecutionRecorder.record({
            id: this._idGenerator.next('exec'),
            adapter: check.action.adapter,
            permissionTier: tier,
            command: ProcessRunner._command(check),
            status: CheckStatus.NotExecutable,
            startedAt: startedAt,
            endedAt: startedAt,
            durationMs: 0,
            stdout: '',
            stderr: `permission_denied: ${tier} exceeds the allowed tier`,
            cycleId: cycleId,
            checkId: check.id
        });

        return {status: CheckStatus.NotExecutable, reason: `permission_denied: ${tier}`, execution: execution};
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