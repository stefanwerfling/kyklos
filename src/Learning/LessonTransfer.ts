/**
 * LessonTransfer — decides whether a lesson may be proposed to a target project.
 *
 * A lesson transfers only when it is validated, its required technologies are
 * present in the target project's stack, every stated condition has been checked
 * and confirmed for the target, and it carries no sensitive content. Otherwise
 * the reasons are returned so the refusal is explainable. Transfer only ever
 * *proposes*; it never activates anything on its own.
 */
import {LessonStatus} from '../Domain/Common.js';
import {Lesson} from '../Domain/Lesson.js';
import {Project} from '../Domain/Project.js';
import {LessonSanitizer} from './LessonSanitizer.js';

/**
 * The outcome of a transfer evaluation.
 */
export interface TransferDecision {

    /**
     * Whether the lesson may be proposed to the target project.
     * @member {boolean}
     */
    transferable: boolean;

    /**
     * Reasons the lesson is not transferable (empty when transferable).
     * @member {string[]}
     */
    reasons: string[];
}

/**
 * Static evaluator of cross-project lesson transfer.
 */
export class LessonTransfer {

    /**
     * Evaluate whether a lesson may be proposed to a target project.
     * @param {Lesson} lesson - The lesson to transfer.
     * @param {Project} project - The target project.
     * @param {string[]} confirmedConditions - Conditions checked and confirmed for the target.
     * @returns {TransferDecision} Transferability and the reasons against it.
     */
    public static evaluate(lesson: Lesson, project: Project, confirmedConditions: string[]): TransferDecision {
        const reasons: string[] = [];

        if (lesson.validationStatus === LessonStatus.Draft) {
            reasons.push('lesson is not validated');
        }

        const missingTech = lesson.appliesTo.tech.filter((tech): boolean => !project.stack.includes(tech));

        if (missingTech.length > 0) {
            reasons.push(`missing tech in target stack: ${missingTech.join(', ')}`);
        }

        const confirmed = new Set(confirmedConditions);
        const unmet = lesson.conditions.filter((condition): boolean => !confirmed.has(condition));

        if (unmet.length > 0) {
            reasons.push(`unmet conditions: ${unmet.join(', ')}`);
        }

        const sensitive = LessonSanitizer.inspect(lesson);

        if (sensitive.length > 0) {
            reasons.push(`sensitive content must not be transferred: ${sensitive.join(', ')}`);
        }

        return {transferable: reasons.length === 0, reasons: reasons};
    }

}