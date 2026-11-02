import {describe, expect, it} from 'vitest';
import {
    type CycleRunResult,
    CycleState,
    type ExecutionPlan,
    type PhaseExecutor,
    PlaybookStepKind,
    RandomIdGenerator,
    SystemClock,
    type Workflow,
    WorkflowEngine,
    type WorkflowPhase,
    WorkflowPhaseRunOn,
    WorkflowStatus
} from '../../src/index';
import {makeProject, makeTargetSystem} from '../fixtures';

const executor = (states: Record<string, CycleState>, calls: string[]): PhaseExecutor => {
    return {
        run: async (input): Promise<{plan: ExecutionPlan; cycle?: CycleRunResult;}> => {
            calls.push(input.root.id);
            return {
                plan: {id: `plan-${input.root.id}`} as unknown as ExecutionPlan,
                cycle: {cycle: {id: `cyc-${input.root.id}`, state: states[input.root.id] ?? CycleState.Passed}} as unknown as CycleRunResult
            };
        }
    };
};

const phase = (id: string, dependsOn: string[] = [], opts: {optional?: boolean; runOn?: WorkflowPhaseRunOn; rollback?: boolean;} = {}): WorkflowPhase => {
    return {
        id: id, name: id, dependsOn: dependsOn, optional: opts.optional ?? false,
        root: {kind: PlaybookStepKind.Procedure, id: id, version: '1.0.0'},
        targetSystemId: undefined,
        rollback: opts.rollback === true ? {kind: PlaybookStepKind.Procedure, id: `${id}-rb`, version: '1.0.0'} : undefined,
        runOn: opts.runOn
    };
};

const wf = (phases: WorkflowPhase[]): Workflow => {
    return {id: 'wf', version: '1.0.0', name: 'wf', status: WorkflowStatus.Published, phases: phases};
};

const engineWith = (states: Record<string, CycleState>, calls: string[]): WorkflowEngine => {
    return new WorkflowEngine({executor: executor(states, calls), idGenerator: new RandomIdGenerator(), clock: new SystemClock()});
};

const runInput = (workflow: Workflow) => {
    return {project: makeProject(), workflow: workflow, target: makeTargetSystem()};
};

describe('WorkflowEngine', () => {
    it('runs phases in dependency order to passed', async () => {
        const calls: string[] = [];
        const result = await engineWith({}, calls).run(runInput(wf([phase('p2', ['p1']), phase('p1')])));
        expect(result.state).toBe(CycleState.Passed);
        expect(calls).toEqual(['p1', 'p2']);
    });

    it('stops normal phases after a critical failure', async () => {
        const calls: string[] = [];
        const result = await engineWith({p1: CycleState.Failed}, calls).run(runInput(wf([phase('p1'), phase('p2', ['p1'])])));
        expect(result.state).toBe(CycleState.Failed);
        expect(calls).toEqual(['p1']);
    });

    it('runs the failed phase rollback', async () => {
        const calls: string[] = [];
        const result = await engineWith({p1: CycleState.Failed}, calls).run(runInput(wf([phase('p1', [], {rollback: true})])));
        expect(result.phaseRuns.map((r) => r.phaseId)).toContain('p1:rollback');
        expect(calls).toContain('p1-rb');
    });

    it('continues past an optional failure with deviations', async () => {
        const calls: string[] = [];
        const result = await engineWith({p2: CycleState.Failed}, calls).run(runInput(wf([phase('p1'), phase('p2', ['p1'], {optional: true})])));
        expect(result.state).toBe(CycleState.PassedWithDeviations);
        expect(calls).toEqual(['p1', 'p2']);
    });

    it('pauses on a critical manual release', async () => {
        const calls: string[] = [];
        const result = await engineWith({p2: CycleState.ManualReleaseRequired}, calls).run(runInput(wf([phase('p1'), phase('p2', ['p1']), phase('p3', ['p2'])])));
        expect(result.state).toBe(CycleState.ManualReleaseRequired);
        expect(calls).not.toContain('p3');
    });

    it('runs a recovery phase only after a prior failure', async () => {
        const calls: string[] = [];
        const result = await engineWith({p1: CycleState.Failed}, calls).run(runInput(wf([phase('p1'), phase('rec', [], {runOn: WorkflowPhaseRunOn.OnPriorFailure})])));
        expect(calls).toContain('rec');
        expect(result.state).toBe(CycleState.Failed);
    });

    it('refuses a phase dependency cycle', async () => {
        const result = await engineWith({}, []).run(runInput(wf([phase('p1', ['p2']), phase('p2', ['p1'])])));
        expect(result.state).toBe(CycleState.Failed);
        expect(result.diagnostics.join(' ')).toContain('cycle');
    });
});