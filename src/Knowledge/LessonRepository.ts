/**
 * LessonRepository — the layered lesson API.
 *
 * A thin façade over the LayeredKnowledgeStore that adds contradiction detection
 * and relevance filtering (reusing LessonTransfer), so callers resolve, list,
 * check conflicts and find applicable lessons through one surface.
 */
import {Project} from '../Domain/Project.js';
import {Diagnostic} from '../Domain/ExecutionPlan.js';
import {Lesson} from '../Domain/Lesson.js';
import {LessonTransfer} from '../Learning/LessonTransfer.js';
import {ContradictionDetector} from './ContradictionDetector.js';
import {LayeredKnowledgeStore, ScopedLesson} from './LayeredKnowledgeStore.js';

/**
 * Layered lesson repository.
 */
export class LessonRepository {

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
     * Save a lesson to its scope layer.
     * @param {Lesson} lesson - The lesson to save.
     * @returns {Promise<void>}
     */
    public async save(lesson: Lesson): Promise<void> {
        await this._store.putLesson(lesson);
    }

    /**
     * Resolve a lesson across layers (most specific first).
     * @param {string} id - Lesson id.
     * @param {string} version - Lesson version.
     * @returns {Promise<ScopedLesson|undefined>} The resolved lesson and scope.
     */
    public async resolve(id: string, version: string): Promise<ScopedLesson|undefined> {
        return this._store.resolveLesson(id, version);
    }

    /**
     * List every lesson across layers.
     * @returns {Promise<ScopedLesson[]>} All lessons with their scopes.
     */
    public async all(): Promise<ScopedLesson[]> {
        return this._store.all();
    }

    /**
     * Detect cross-scope contradictions.
     * @returns {Promise<Diagnostic[]>} Conflict diagnostics.
     */
    public async contradictions(): Promise<Diagnostic[]> {
        return ContradictionDetector.detect(await this._store.all());
    }

    /**
     * Find lessons that apply to a project (reusing the transfer gate).
     * @param {Project} project - The target project.
     * @param {string[]} confirmedConditions - Conditions confirmed for the project.
     * @returns {Promise<ScopedLesson[]>} The applicable lessons.
     */
    public async relevantFor(project: Project, confirmedConditions: string[]): Promise<ScopedLesson[]> {
        const all = await this._store.all();
        return all.filter((scoped): boolean => LessonTransfer.evaluate(scoped.lesson, project, confirmedConditions).transferable);
    }

}