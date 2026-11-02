/**
 * TaskStateResolver — derives a task's lifecycle state from its records.
 *
 * Deterministic and mirroring the other resolvers. A human task completes only
 * via validated feedback/approval, never a bare flag: a manual/delegated task is
 * completed only when the latest feedback is a pass AND the required evidence is
 * attached; an approval task is completed only when the latest approval is an
 * approve under the required role. Automatic tasks map the check's observation.
 * llm_assisted is treated like manual — the LLM only suggests; a person confirms.
 */
import {ApprovalDecision, CheckStatus, FeedbackResult, TaskMode, TaskState} from '../Domain/Common.js';
import {Approval} from '../Domain/Approval.js';
import {Feedback} from '../Domain/Feedback.js';
import {Observation} from '../Domain/Observation.js';
import {Task} from '../Domain/Task.js';
import {TaskAssignment} from '../Domain/TaskAssignment.js';

/**
 * The records a task's state is derived from.
 */
export interface TaskStateInput {

    /**
     * The task header.
     * @member {Task}
     */
    task: Task;

    /**
     * Assignments recorded for the task.
     * @member {TaskAssignment[]}
     */
    assignments: TaskAssignment[];

    /**
     * Feedback recorded for the task (in submission order).
     * @member {Feedback[]}
     */
    feedbacks: Feedback[];

    /**
     * Approvals recorded for the task (in decision order).
     * @member {Approval[]}
     */
    approvals: Approval[];

    /**
     * The observation produced by an automatic task's check, if any.
     * @member {Observation|undefined}
     */
    observation?: Observation;
}

/**
 * Static resolver of task state.
 */
export class TaskStateResolver {

    /**
     * Derive the task's state.
     * @param {TaskStateInput} input - The task and its records.
     * @returns {TaskState} The derived state.
     */
    public static resolve(input: TaskStateInput): TaskState {
        if (input.task.mode === TaskMode.Automatic) {
            return TaskStateResolver._automatic(input.observation);
        }

        if (input.task.mode === TaskMode.Approval) {
            return TaskStateResolver._approvalBased(input);
        }

        return TaskStateResolver._feedbackBased(input);
    }

    /**
     * Map an automatic task's observation to a task state.
     * @param {Observation|undefined} observation - The check observation, if any.
     * @returns {TaskState} The derived state.
     */
    protected static _automatic(observation: Observation|undefined): TaskState {
        if (observation === undefined) {
            return TaskState.Pending;
        }

        switch (observation.status) {
            case CheckStatus.Passed:
                return TaskState.Completed;
            case CheckStatus.Failed:
                return TaskState.Failed;
            case CheckStatus.Skipped:
            case CheckStatus.NotApplicable:
                return TaskState.Skipped;
            default:
                return TaskState.Blocked;
        }
    }

    /**
     * Derive a manual/delegated/llm_assisted task's state from feedback.
     * @param {TaskStateInput} input - The task and its records.
     * @returns {TaskState} The derived state.
     */
    protected static _feedbackBased(input: TaskStateInput): TaskState {
        if (input.assignments.length === 0) {
            return TaskState.Ready;
        }

        const feedback = input.feedbacks.at(-1);

        if (feedback === undefined) {
            return TaskState.WaitingForInput;
        }

        if (feedback.result === FeedbackResult.Fail) {
            return TaskState.Failed;
        }

        if (feedback.result === FeedbackResult.Pass && TaskStateResolver._evidenceCovered(input.task, feedback)) {
            return TaskState.Completed;
        }

        return TaskState.WaitingForInput;
    }

    /**
     * Whether the feedback attaches enough evidence for the task's requirements.
     * @param {Task} task - The task.
     * @param {Feedback} feedback - The latest feedback.
     * @returns {boolean} True when every required evidence slot is covered.
     */
    protected static _evidenceCovered(task: Task, feedback: Feedback): boolean {
        return feedback.evidenceIds.length >= task.evidenceRequirements.length;
    }

    /**
     * Derive an approval task's state from the latest approval.
     * @param {TaskStateInput} input - The task and its records.
     * @returns {TaskState} The derived state.
     */
    protected static _approvalBased(input: TaskStateInput): TaskState {
        if (input.assignments.length === 0) {
            return TaskState.Ready;
        }

        const approval = input.approvals.at(-1);

        if (approval === undefined) {
            return TaskState.WaitingForApproval;
        }

        if (input.task.assigneeRole !== undefined && approval.role !== input.task.assigneeRole) {
            return TaskState.WaitingForApproval;
        }

        return approval.decision === ApprovalDecision.Approve ? TaskState.Completed : TaskState.Failed;
    }

}