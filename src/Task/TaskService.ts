/**
 * TaskService — the task lifecycle over the append-only store.
 *
 * Assignments and feedback are appended (never mutated); the current state is
 * derived by TaskStateResolver. Authorization is fail-closed: only an actor with
 * the required role may be assigned, and only an assigned actor may submit
 * feedback. A terminal human task is bridged into an Observation plus
 * manually_confirmed evidence, so it enters the cycle/report like any other
 * result — and its completion is derived from feedback + criteria, never a flag.
 */
import {Schema} from 'vts';
import {CheckStatus, FeedbackResult, TaskMode, TaskState} from '../Domain/Common.js';
import {Actor} from '../Domain/Actor.js';
import {Approval, ApprovalSchema} from '../Domain/Approval.js';
import {Evidence, EvidenceSchema} from '../Domain/Evidence.js';
import {Feedback, FeedbackSchema} from '../Domain/Feedback.js';
import {Observation, ObservationSchema} from '../Domain/Observation.js';
import {Task} from '../Domain/Task.js';
import {TaskAssignment, TaskAssignmentSchema} from '../Domain/TaskAssignment.js';
import {Clock} from '../Cycle/Clock.js';
import {IdGenerator} from '../Cycle/IdGenerator.js';
import {EvidenceFactory} from '../Execution/EvidenceFactory.js';
import {KyklosError, KyklosErrorCode} from '../KyklosError.js';
import {FileStore} from '../Store/FileStore.js';
import {TaskStateResolver} from './TaskStateResolver.js';

const SYNTHETIC_CHECK_VERSION = '1.0.0';

/**
 * The input of a feedback submission.
 */
export interface FeedbackInput {
    result: FeedbackResult;
    evidenceIds: string[];
    note?: string;
    timeSpentMinutes?: number;
}

/**
 * The outcome of finalizing a task.
 */
export interface TaskOutcome {
    state: TaskState;
    observation?: Observation;
    evidence?: Evidence;
}

/**
 * Collaborators the task service depends on.
 */
export interface TaskServiceOptions {
    store: FileStore;
    idGenerator: IdGenerator;
    clock: Clock;
}

const TERMINAL = new Set<TaskState>([TaskState.Completed, TaskState.Failed]);

/**
 * Manages the task lifecycle.
 */
export class TaskService {

    /**
     * Backing store.
     * @member {FileStore}
     */
    protected readonly _store: FileStore;

    /**
     * Injected id source.
     * @member {IdGenerator}
     */
    protected readonly _idGenerator: IdGenerator;

    /**
     * Injected clock.
     * @member {Clock}
     */
    protected readonly _clock: Clock;

    /**
     * @param {TaskServiceOptions} options - Store and injected collaborators.
     */
    public constructor(options: TaskServiceOptions) {
        this._store = options.store;
        this._idGenerator = options.idGenerator;
        this._clock = options.clock;
    }

    /**
     * Assign a task to an actor (fail-closed on a missing required role).
     * @param {Task} task - The task to assign.
     * @param {Actor} actor - The actor to assign it to.
     * @param {string} [dueAt] - Optional due timestamp.
     * @returns {Promise<TaskAssignment>} The recorded assignment.
     */
    public async assign(task: Task, actor: Actor, dueAt?: string): Promise<TaskAssignment> {
        if (task.assigneeRole !== undefined && !actor.roles.includes(task.assigneeRole)) {
            throw new KyklosError(KyklosErrorCode.InvalidState, `actor '${actor.id}' lacks required role '${task.assigneeRole}'`);
        }

        const assignment: TaskAssignment = {id: this._idGenerator.next('tasgn'), taskId: task.id, actorId: actor.id, assignedAt: this._clock.now(), dueAt: dueAt};
        await this._store.appendRecord('taskAssignment', TaskAssignmentSchema, assignment);
        return assignment;
    }

    /**
     * Submit feedback for a task (only an assigned actor may).
     * @param {Task} task - The task.
     * @param {string} actorId - The submitting actor.
     * @param {FeedbackInput} input - The reported result and evidence.
     * @returns {Promise<Feedback>} The recorded feedback.
     */
    public async submitFeedback(task: Task, actorId: string, input: FeedbackInput): Promise<Feedback> {
        const assignments = await this._byTask<TaskAssignment>('taskAssignment', TaskAssignmentSchema, task.id);

        if (!assignments.some((assignment): boolean => assignment.actorId === actorId)) {
            throw new KyklosError(KyklosErrorCode.InvalidState, `actor '${actorId}' is not assigned to task '${task.id}'`);
        }

        const feedback: Feedback = {id: this._idGenerator.next('fb'), taskId: task.id, actorId: actorId, result: input.result, note: input.note, evidenceIds: input.evidenceIds, timeSpentMinutes: input.timeSpentMinutes, submittedAt: this._clock.now()};
        await this._store.appendRecord('feedback', FeedbackSchema, feedback);
        return feedback;
    }

    /**
     * Derive the current state of a task.
     * @param {Task} task - The task.
     * @param {Observation} [observation] - The automatic observation, if any.
     * @returns {Promise<TaskState>} The derived state.
     */
    public async stateOf(task: Task, observation?: Observation): Promise<TaskState> {
        const records = await this._records(task.id);
        return TaskStateResolver.resolve({task: task, ...records, observation: observation});
    }

    /**
     * Finalize a task: derive its state and, for a terminal human task, produce
     * an Observation plus manually_confirmed evidence (persisted).
     * @param {Task} task - The task.
     * @param {Observation} [observation] - The automatic observation, if any.
     * @returns {Promise<TaskOutcome>} The state and any produced observation/evidence.
     */
    public async finalize(task: Task, observation?: Observation): Promise<TaskOutcome> {
        const records = await this._records(task.id);
        const state = TaskStateResolver.resolve({task: task, ...records, observation: observation});

        if (task.mode === TaskMode.Automatic) {
            return {state: state, observation: observation};
        }

        if (!TERMINAL.has(state)) {
            return {state: state};
        }

        const createdAt = this._clock.now();
        const latestFeedback = records.feedbacks.at(-1);
        const latestApproval = records.approvals.at(-1);
        const actor = latestApproval?.actorId ?? latestFeedback?.actorId ?? 'unknown';
        const evidence = EvidenceFactory.manuallyConfirmed(`${task.mode} ${state}: ${task.description}`, actor, this._idGenerator.next('ev'), createdAt);
        await this._store.appendRecord('evidence', EvidenceSchema, evidence);

        const feedbackEvidence = latestFeedback?.evidenceIds ?? [];
        const observationRecord: Observation = {
            id: this._idGenerator.next('obs'),
            checkId: task.id,
            checkVersion: SYNTHETIC_CHECK_VERSION,
            status: TaskService._toStatus(state),
            actual: {taskState: state},
            measuredAt: createdAt,
            evidenceIds: [evidence.id, ...feedbackEvidence]
        };
        await this._store.appendRecord('observation', ObservationSchema, observationRecord);

        return {state: state, observation: observationRecord, evidence: evidence};
    }

    /**
     * Load a task's assignment/feedback/approval records.
     * @param {string} taskId - The task id.
     * @returns {Promise<{assignments: TaskAssignment[]; feedbacks: Feedback[]; approvals: Approval[];}>} The records.
     */
    protected async _records(taskId: string): Promise<{assignments: TaskAssignment[]; feedbacks: Feedback[]; approvals: Approval[];}> {
        const assignments = await this._byTask<TaskAssignment>('taskAssignment', TaskAssignmentSchema, taskId);
        const feedbacks = await this._byTask<Feedback>('feedback', FeedbackSchema, taskId);
        const approvals = await this._byTask<Approval>('approval', ApprovalSchema, taskId);
        return {assignments: assignments, feedbacks: feedbacks, approvals: approvals};
    }

    /**
     * List a collection's records for one task, in stored order.
     * @param {string} collection - The record collection.
     * @param {S} schema - The record schema.
     * @param {string} taskId - The task id.
     * @returns {Promise<T[]>} The matching records.
     */
    protected async _byTask<T extends {taskId: string;}>(collection: string, schema: Schema<unknown>, taskId: string): Promise<T[]> {
        const all = await this._store.listRecords(collection, schema);
        return (all as T[]).filter((record): boolean => record.taskId === taskId);
    }

    /**
     * Map a terminal task state to a check status.
     * @param {TaskState} state - The task state.
     * @returns {CheckStatus} The corresponding check status.
     */
    protected static _toStatus(state: TaskState): CheckStatus {
        if (state === TaskState.Completed) {
            return CheckStatus.Passed;
        }

        return CheckStatus.Failed;
    }

}