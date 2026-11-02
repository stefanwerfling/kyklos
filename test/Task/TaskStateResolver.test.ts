import {describe, expect, it} from 'vitest';
import {
    ApprovalDecision,
    CheckStatus,
    FeedbackResult,
    TaskMode,
    TaskState,
    type TaskStateInput,
    TaskStateResolver
} from '../../src/index';
import {makeApproval, makeFeedback, makeObservation, makeTask, makeTaskAssignment} from '../fixtures';

const input = (over: Partial<TaskStateInput>): TaskStateInput => {
    return {task: makeTask(), assignments: [], feedbacks: [], approvals: [], ...over};
};

describe('TaskStateResolver — manual', () => {
    it('is ready before assignment', () => {
        expect(TaskStateResolver.resolve(input({}))).toBe(TaskState.Ready);
    });

    it('waits for input once assigned', () => {
        expect(TaskStateResolver.resolve(input({assignments: [makeTaskAssignment()]}))).toBe(TaskState.WaitingForInput);
    });

    it('completes on a pass with the required evidence', () => {
        expect(TaskStateResolver.resolve(input({assignments: [makeTaskAssignment()], feedbacks: [makeFeedback()]}))).toBe(TaskState.Completed);
    });

    it('does not complete on a pass without the required evidence', () => {
        const feedback = {...makeFeedback(), evidenceIds: []};
        expect(TaskStateResolver.resolve(input({assignments: [makeTaskAssignment()], feedbacks: [feedback]}))).toBe(TaskState.WaitingForInput);
    });

    it('fails on a fail result', () => {
        const feedback = {...makeFeedback(), result: FeedbackResult.Fail};
        expect(TaskStateResolver.resolve(input({assignments: [makeTaskAssignment()], feedbacks: [feedback]}))).toBe(TaskState.Failed);
    });
});

describe('TaskStateResolver — automatic', () => {
    const task = {...makeTask(), mode: TaskMode.Automatic};

    it('maps a passed observation to completed', () => {
        expect(TaskStateResolver.resolve({task: task, assignments: [], feedbacks: [], approvals: [], observation: {...makeObservation(), status: CheckStatus.Passed}})).toBe(TaskState.Completed);
    });

    it('is pending without an observation', () => {
        expect(TaskStateResolver.resolve({task: task, assignments: [], feedbacks: [], approvals: []})).toBe(TaskState.Pending);
    });
});

describe('TaskStateResolver — approval', () => {
    const task = {...makeTask(), mode: TaskMode.Approval, assigneeRole: 'release-approver'};

    it('completes on an approve under the required role', () => {
        const approval = {...makeApproval(), role: 'release-approver', decision: ApprovalDecision.Approve};
        expect(TaskStateResolver.resolve({task: task, assignments: [makeTaskAssignment()], feedbacks: [], approvals: [approval]})).toBe(TaskState.Completed);
    });

    it('does not complete on an approve under the wrong role', () => {
        const approval = {...makeApproval(), role: 'intern', decision: ApprovalDecision.Approve};
        expect(TaskStateResolver.resolve({task: task, assignments: [makeTaskAssignment()], feedbacks: [], approvals: [approval]})).toBe(TaskState.WaitingForApproval);
    });

    it('fails on a reject', () => {
        const approval = {...makeApproval(), role: 'release-approver', decision: ApprovalDecision.Reject};
        expect(TaskStateResolver.resolve({task: task, assignments: [makeTaskAssignment()], feedbacks: [], approvals: [approval]})).toBe(TaskState.Failed);
    });
});