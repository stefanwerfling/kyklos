/**
 * Deterministic test doubles for the injected cycle collaborators.
 */
import {
    type Clock,
    type CycleRunResult,
    CycleState,
    type ExecutionPlan,
    type IdGenerator,
    type PhaseExecutor,
    type PhaseRoot,
    type Project,
    type TargetSystem
} from '../src/index';
import {makeCycle, makeExecutionPlan} from './fixtures';

export class FixedClock implements Clock {
    public now(): string {
        return '2026-10-28T00:00:00.000Z';
    }
}

export class SequentialIdGenerator implements IdGenerator {
    private _counter = 0;

    public next(prefix?: string): string {
        this._counter += 1;
        return `${prefix ?? 'id'}-${this._counter}`;
    }
}

/**
 * A PhaseExecutor whose cycle state is chosen per target id, counting calls.
 * Lets wave/rollout tests drive outcomes deterministically without a real run.
 */
export class StubPhaseExecutor implements PhaseExecutor {
    public calls = 0;
    private readonly _stateByTarget: Map<string, CycleState>;

    public constructor(stateByTarget: Map<string, CycleState>) {
        this._stateByTarget = stateByTarget;
    }

    public run(input: {project: Project; target: TargetSystem; root: PhaseRoot;}): Promise<{plan: ExecutionPlan; cycle?: CycleRunResult;}> {
        this.calls += 1;
        const state = this._stateByTarget.get(input.target.id) ?? CycleState.Passed;
        const cycle: CycleRunResult = {
            cycle: {...makeCycle(), id: `cyc-${input.target.id}-${this.calls}`, state: state},
            observations: [],
            deviations: [],
            toolExecutions: [],
            evidence: []
        };
        return Promise.resolve({plan: {...makeExecutionPlan(), id: `plan-${input.target.id}-${this.calls}`}, cycle: cycle});
    }
}