/**
 * Notify: the WaveController announces rollout progress through an optional
 * Notifier that can never change the result — a throwing notifier is swallowed,
 * and a message that trips the secret scanner is redacted.
 */
import {describe, expect, it} from 'vitest';
import {
    CycleState,
    type Environment,
    EnvironmentKind,
    type NotificationEvent,
    NotificationKind,
    type Notifier,
    RecordingNotifier,
    type TargetSystem,
    WaveController,
    WaveState,
    WorkflowEngine
} from '../../src/index';
import {FixedClock, SequentialIdGenerator, StubPhaseExecutor} from '../doubles';
import {makeProject, makeWorkflow} from '../fixtures';

const envA: Environment = {id: 'env-a', name: 'test-a', kind: EnvironmentKind.Test, targetSystemId: 'tgt-a', labels: undefined, address: undefined};
const envB: Environment = {id: 'env-b', name: 'prod-b', kind: EnvironmentKind.Production, targetSystemId: 'tgt-b', labels: undefined, address: undefined};
const resolveTarget = (environment: Environment): TargetSystem => {
    return {id: environment.targetSystemId, os: 'debian', osVersion: undefined, technologies: []};
};
const input = {project: makeProject(), workflow: makeWorkflow(), waves: [[envA], [envB]], resolveTarget: resolveTarget};

const controllerWith = (notifier: Notifier, stateByTarget: Map<string, CycleState>): WaveController => {
    const engine = new WorkflowEngine({executor: new StubPhaseExecutor(stateByTarget), idGenerator: new SequentialIdGenerator(), clock: new FixedClock()});
    return new WaveController({engine: engine, idGenerator: new SequentialIdGenerator(), clock: new FixedClock(), notifier: notifier});
};

class ThrowingNotifier implements Notifier {
    public notify(_event: NotificationEvent): void {
        throw new Error('notifier is down');
    }
}

describe('WaveController notifications', () => {
    it('emits started, per-wave and completed events on a clean rollout', async () => {
        const notifier = new RecordingNotifier();
        await controllerWith(notifier, new Map()).run(input);
        const kinds = notifier.events().map((event) => event.kind);
        expect(kinds[0]).toBe(NotificationKind.RolloutStarted);
        expect(kinds).toContain(NotificationKind.WavePassed);
        expect(kinds.at(-1)).toBe(NotificationKind.RolloutCompleted);
    });

    it('emits a failed wave and a blocked wave when a wave fails', async () => {
        const notifier = new RecordingNotifier();
        await controllerWith(notifier, new Map([['tgt-a', CycleState.Failed]])).run(input);
        const kinds = notifier.events().map((event) => event.kind);
        expect(kinds).toContain(NotificationKind.WaveFailed);
        expect(kinds).toContain(NotificationKind.WaveBlocked);
    });

    it('a throwing notifier never changes the rollout result', async () => {
        const result = await controllerWith(new ThrowingNotifier(), new Map()).run(input);
        expect(result.state).toBe(WaveState.Passed);
        expect(result.environmentRuns).toHaveLength(2);
    });
});
