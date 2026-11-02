/**
 * KnowledgeSync — secret-safe export and condition-gated import of lessons.
 *
 * Export scrubs: a lesson with sensitive content is skipped, never written to a
 * bundle. Import gates: each lesson passes LessonTransfer (validated, compatible
 * and all conditions confirmed, no sensitive content) before it is written into
 * the target project's layer. Secrets, PII and internal hosts never cross.
 */
import {KnowledgeScope} from '../Domain/Common.js';
import {Lesson} from '../Domain/Lesson.js';
import {Project} from '../Domain/Project.js';
import {LessonSanitizer} from '../Learning/LessonSanitizer.js';
import {LessonTransfer} from '../Learning/LessonTransfer.js';
import {LayeredKnowledgeStore} from './LayeredKnowledgeStore.js';

/**
 * A lesson that was not exported/imported, with reasons.
 */
export interface SkippedLesson {
    lesson: Lesson;
    reasons: string[];
}

/**
 * The result of an export.
 */
export interface ExportResult {
    exported: Lesson[];
    skipped: SkippedLesson[];
}

/**
 * The result of an import.
 */
export interface ImportResult {
    imported: Lesson[];
    rejected: SkippedLesson[];
}

/**
 * Exports and imports lessons between layers/projects, secret-safe.
 */
export class KnowledgeSync {

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
     * Export the lessons of a scope, scrubbing any with sensitive content.
     * @param {KnowledgeScope} scope - The scope to export.
     * @returns {Promise<ExportResult>} The exportable lessons and the skipped ones.
     */
    public async export(scope: KnowledgeScope): Promise<ExportResult> {
        const all = await this._store.all();
        const exported: Lesson[] = [];
        const skipped: SkippedLesson[] = [];

        for (const scoped of all) {
            if (scoped.scope !== scope) {
                continue;
            }

            const sensitive = LessonSanitizer.inspect(scoped.lesson);

            if (sensitive.length > 0) {
                skipped.push({lesson: scoped.lesson, reasons: [`sensitive content: ${sensitive.join(', ')}`]});
            } else {
                exported.push(scoped.lesson);
            }
        }

        return {exported: exported, skipped: skipped};
    }

    /**
     * Import a bundle into a target project's layer, gating each lesson.
     * @param {Lesson[]} bundle - The lessons to import.
     * @param {Project} project - The target project.
     * @param {string[]} confirmedConditions - Conditions confirmed for the project.
     * @returns {Promise<ImportResult>} The imported lessons and the rejected ones.
     */
    public async import(bundle: Lesson[], project: Project, confirmedConditions: string[]): Promise<ImportResult> {
        const imported: Lesson[] = [];
        const rejected: SkippedLesson[] = [];

        for (const lesson of bundle) {
            const decision = LessonTransfer.evaluate(lesson, project, confirmedConditions);

            if (!decision.transferable) {
                rejected.push({lesson: lesson, reasons: decision.reasons});
                continue;
            }

            // sequential by design — append-only writes
            // eslint-disable-next-line no-await-in-loop
            await this._store.putLesson({...lesson, scope: KnowledgeScope.Project});
            imported.push(lesson);
        }

        return {imported: imported, rejected: rejected};
    }

}