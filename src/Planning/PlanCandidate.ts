/**
 * PlanCandidate — a plan an advisor proposes, as plain data.
 *
 * It carries a draft Playbook or Workflow (depending on kind) plus the goal and
 * rationale behind it. It is never persisted or made runnable by itself: the
 * PlanProposalService stores the candidate as a draft and runs deterministic
 * validation, and only an authorized human can publish it. An advisor returns
 * this structure — it never returns a result, a status, or a decision.
 */
import {PlanKind} from '../Domain/Common.js';
import {Playbook} from '../Domain/Playbook.js';
import {Workflow} from '../Domain/Workflow.js';

/**
 * A proposed plan (draft), to be validated and, if approved, published.
 */
export interface PlanCandidate {

    /**
     * Whether this candidate is a playbook or a workflow.
     * @member {PlanKind}
     */
    kind: PlanKind;

    /**
     * What the plan is meant to achieve.
     * @member {string}
     */
    goal: string;

    /**
     * Why the advisor proposed it (advisory text only).
     * @member {string}
     */
    rationale: string;

    /**
     * The draft playbook, present when kind is Playbook.
     * @member {Playbook|undefined}
     */
    playbook?: Playbook;

    /**
     * The draft workflow, present when kind is Workflow.
     * @member {Workflow|undefined}
     */
    workflow?: Workflow;
}