import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {
    type Actor,
    CheckStatus,
    EvidenceSource,
    FeedbackResult,
    FileStore,
    KyklosError,
    RandomIdGenerator,
    SystemClock,
    TaskService,
    TaskState
} from '../../src/index';
import {makeActor, makeTask} from '../fixtures';

describe('TaskService', () => {
    let root: string;
    let service: TaskService;
    const task = makeTask();
    const actor = makeActor();

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'kyklos-task-'));
        service = new TaskService({store: new FileStore(root), idGenerator: new RandomIdGenerator(), clock: new SystemClock()});
    });

    afterEach(async () => {
        await rm(root, {recursive: true, force: true});
    });

    it('refuses to assign an actor lacking the required role', async () => {
        const intern: Actor = {...makeActor(), id: 'intern', roles: []};
        await expect(service.assign(task, intern)).rejects.toBeInstanceOf(KyklosError);
    });

    it('refuses feedback from an actor who is not assigned', async () => {
        await service.assign(task, actor);
        await expect(service.submitFeedback(task, 'someone-else', {result: FeedbackResult.Pass, evidenceIds: ['ev-x']})).rejects.toBeInstanceOf(KyklosError);
    });

    it('completes a manual task from a pass with evidence and bridges it to an observation', async () => {
        await service.assign(task, actor);
        await service.submitFeedback(task, actor.id, {result: FeedbackResult.Pass, evidenceIds: ['ev-photo']});

        const outcome = await service.finalize(task);
        expect(outcome.state).toBe(TaskState.Completed);
        expect(outcome.observation?.status).toBe(CheckStatus.Passed);
        expect(outcome.evidence?.source).toBe(EvidenceSource.ManuallyConfirmed);
        expect(outcome.observation?.evidenceIds).toContain(outcome.evidence?.id);
    });

    it('does not complete (or produce an observation) when required evidence is missing', async () => {
        await service.assign(task, actor);
        await service.submitFeedback(task, actor.id, {result: FeedbackResult.Pass, evidenceIds: []});

        const outcome = await service.finalize(task);
        expect(outcome.state).toBe(TaskState.WaitingForInput);
        expect(outcome.observation).toBeUndefined();
    });
});