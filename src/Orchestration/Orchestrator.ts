/**
 * Orchestrator — runs a plan of checks deterministically and records metrics.
 *
 * The cycle state is derived ONLY from the runner's results via the gatekeeping
 * resolver. An optional LlmAdvisor may add suggestions, but those live in a
 * separate field and can never change a status or the derived state — the LLM
 * cannot flip a result. Per-cycle cost/runtime and LLM call count are recorded.
 */
import {Check} from '../Domain/Check.js';
import {CheckStatus, CycleState} from '../Domain/Common.js';
import {Project} from '../Domain/Project.js';
import {Clock} from '../Cycle/Clock.js';
import {CheckStatusEntry, CycleStateResolver} from '../Cycle/CycleStateResolver.js';
import {CheckRunner} from '../Runner/CheckRunner.js';
import {RunOptions} from '../Runner/AdapterTypes.js';
import {LlmAdvisor} from './LlmAdvisor.js';

/**
 * Per-check result line.
 */
export interface CheckResultLine {

    /**
     * The check id.
     * @member {string}
     */
    checkId: string;

    /**
     * The resulting status.
     * @member {CheckStatus}
     */
    status: CheckStatus;

    /**
     * The reason for the status.
     * @member {string}
     */
    reason: string;
}

/**
 * Cost/runtime metrics of a cycle.
 */
export interface CycleMetrics {

    /**
     * Number of checks run.
     * @member {number}
     */
    checkCount: number;

    /**
     * Wall-clock duration in milliseconds.
     * @member {number}
     */
    durationMs: number;

    /**
     * Number of LLM advisor calls made.
     * @member {number}
     */
    llmCalls: number;
}

/**
 * The result of an orchestrated cycle.
 */
export interface OrchestrationResult {

    /**
     * Per-check results.
     * @member {CheckResultLine[]}
     */
    results: CheckResultLine[];

    /**
     * The derived cycle state (from results only).
     * @member {CycleState}
     */
    state: CycleState;

    /**
     * Cost/runtime metrics.
     * @member {CycleMetrics}
     */
    metrics: CycleMetrics;

    /**
     * Advisory suggestions (never affect status or state).
     * @member {string[]}
     */
    suggestions: string[];
}

/**
 * Collaborators the orchestrator depends on.
 */
export interface OrchestratorOptions {

    /**
     * Runner used to execute checks.
     * @member {CheckRunner}
     */
    runner: CheckRunner;

    /**
     * Injected clock for metrics.
     * @member {Clock}
     */
    clock: Clock;

    /**
     * Optional advisory LLM boundary.
     * @member {LlmAdvisor|undefined}
     */
    advisor?: LlmAdvisor;
}

/**
 * Runs check plans deterministically, with an optional advisory LLM.
 */
export class Orchestrator {

    /**
     * Runner used to execute checks.
     * @member {CheckRunner}
     */
    protected readonly _runner: CheckRunner;

    /**
     * Injected clock.
     * @member {Clock}
     */
    protected readonly _clock: Clock;

    /**
     * Optional advisory LLM boundary.
     * @member {LlmAdvisor|undefined}
     */
    protected readonly _advisor: LlmAdvisor|undefined;

    /**
     * @param {OrchestratorOptions} options - Runner, clock and optional advisor.
     */
    public constructor(options: OrchestratorOptions) {
        this._runner = options.runner;
        this._clock = options.clock;
        this._advisor = options.advisor;
    }

    /**
     * Run a plan of checks and derive the cycle state from the results only.
     * @param {Project} project - The project being verified.
     * @param {Check[]} checks - The ordered checks to run.
     * @param {Record<string, RunOptions>} [runOptions] - Optional per-check run options.
     * @returns {Promise<OrchestrationResult>} Results, derived state, metrics and advisory suggestions.
     */
    public async run(project: Project, checks: Check[], runOptions?: Record<string, RunOptions>): Promise<OrchestrationResult> {
        const startedAt = this._clock.now();
        const results: CheckResultLine[] = [];
        const entries: CheckStatusEntry[] = [];

        for (const check of checks) {
            // sequential by design — checks may have ordering side effects
            // eslint-disable-next-line no-await-in-loop
            const result = await this._runner.run(check, runOptions?.[check.id]);
            results.push({checkId: check.id, status: result.status, reason: result.reason});
            entries.push({status: result.status, criticality: check.criticality});
        }

        const state = CycleStateResolver.resolve(entries);

        let suggestions: string[] = [];
        let llmCalls = 0;

        if (this._advisor !== undefined) {
            suggestions = await this._advisor.suggestChecks({projectName: project.name, checkIds: checks.map((check): string => check.id)});
            llmCalls = 1;
        }

        const endedAt = this._clock.now();

        return {
            results: results,
            state: state,
            metrics: {checkCount: checks.length, durationMs: Orchestrator._durationMs(startedAt, endedAt), llmCalls: llmCalls},
            suggestions: suggestions
        };
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