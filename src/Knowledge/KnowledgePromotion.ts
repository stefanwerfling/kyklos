/**
 * KnowledgePromotion — controlled promotion of a lesson to a broader scope.
 *
 * A lesson is promoted (project → system → global) only when it is validated,
 * carries no sensitive content, is being promoted to a strictly broader scope,
 * and is backed by an approve decision. The authorization of that approval (the
 * actor's role) is enforced when the approval is recorded (ApprovalService). A
 * once-off observation can never reach a broader scope this way.
 */
import {ApprovalDecision, KnowledgeScope, LessonStatus} from '../Domain/Common.js';
import {Approval} from '../Domain/Approval.js';
import {Lesson} from '../Domain/Lesson.js';
import {LessonSanitizer} from '../Learning/LessonSanitizer.js';
import {LayeredKnowledgeStore} from './LayeredKnowledgeStore.js';

const BREADTH: KnowledgeScope[] = [
    KnowledgeScope.Project,
    KnowledgeScope.Technology,
    KnowledgeScope.System,
    KnowledgeScope.Global
];

/**
 * The outcome of a promotion attempt.
 */
export interface PromotionResult {

    /**
     * The promoted lesson, when the promotion was allowed.
     * @member {Lesson|undefined}
     */
    promoted?: Lesson;

    /**
     * Reasons the promotion was refused (empty on success).
     * @member {string[]}
     */
    reasons: string[];
}

/**
 * Promotes lessons to broader scopes under control.
 */
export class KnowledgePromotion {

    /**
     * Backing layered store.
     * @member {LayeredKnowledgeStore}
     */
    protected readonly _store: LayeredKnowledgeStore;

    /**
     * @param {LayeredKnowledgeStore} store - The layered knowledge store.
     */
    public constructor(store: LayeredKnowledgeStore) {
        this._store = store;
    }

    /**
     * Promote a lesson to a broader scope, if allowed.
     * @param {Lesson} lesson - The lesson to promote.
     * @param {KnowledgeScope} targetScope - The broader scope to promote to.
     * @param {Approval} approval - The approve decision authorizing the promotion.
     * @param {string} newVersion - The version of the promoted copy.
     * @returns {Promise<PromotionResult>} The promoted lesson or the refusal reasons.
     */
    public async promote(lesson: Lesson, targetScope: KnowledgeScope, approval: Approval, newVersion: string): Promise<PromotionResult> {
        const reasons = KnowledgePromotion._reasons(lesson, targetScope, approval);

        if (reasons.length > 0) {
            return {reasons: reasons};
        }

        const promoted: Lesson = {...lesson, scope: targetScope, version: newVersion, validationStatus: LessonStatus.Published};
        await this._store.putLesson(promoted);
        return {promoted: promoted, reasons: []};
    }

    /**
     * Collect the reasons a promotion is refused.
     * @param {Lesson} lesson - The lesson.
     * @param {KnowledgeScope} targetScope - The target scope.
     * @param {Approval} approval - The approval.
     * @returns {string[]} Refusal reasons (empty when allowed).
     */
    protected static _reasons(lesson: Lesson, targetScope: KnowledgeScope, approval: Approval): string[] {
        const reasons: string[] = [];

        if (lesson.validationStatus === LessonStatus.Draft) {
            reasons.push('lesson is not validated');
        }

        const sensitive = LessonSanitizer.inspect(lesson);

        if (sensitive.length > 0) {
            reasons.push(`sensitive content must not be promoted: ${sensitive.join(', ')}`);
        }

        if (approval.decision !== ApprovalDecision.Approve) {
            reasons.push('promotion is not approved');
        }

        if (BREADTH.indexOf(targetScope) <= BREADTH.indexOf(lesson.scope)) {
            reasons.push(`target scope '${targetScope}' is not broader than '${lesson.scope}'`);
        }

        return reasons;
    }

}