/**
 * LayeredKnowledgeStore — a stack of FileStores, one per knowledge scope.
 *
 * Reads follow precedence project → technology → system → global (the most
 * specific layer that has the lesson wins for use); writes go to the layer that
 * matches the lesson's scope. Lessons are immutable versioned definitions, so a
 * resolved lesson is reproducible. This composes the unchanged FileStore — no
 * store internals change.
 */
import {KnowledgeScope} from '../Domain/Common.js';
import {Lesson, LessonSchema} from '../Domain/Lesson.js';
import {KyklosError, KyklosErrorCode} from '../KyklosError.js';
import {FileStore} from '../Store/FileStore.js';

const LESSON_COLLECTION = 'lesson';

const PRECEDENCE: KnowledgeScope[] = [
    KnowledgeScope.Project,
    KnowledgeScope.Technology,
    KnowledgeScope.System,
    KnowledgeScope.Global
];

/**
 * A lesson together with the scope layer it was found in.
 */
export interface ScopedLesson {

    /**
     * The lesson.
     * @member {Lesson}
     */
    lesson: Lesson;

    /**
     * The scope layer it came from.
     * @member {KnowledgeScope}
     */
    scope: KnowledgeScope;
}

/**
 * A stack of per-scope stores with precedence reads and scoped writes.
 */
export class LayeredKnowledgeStore {

    /**
     * Configured store per scope.
     * @member {Map<KnowledgeScope, FileStore>}
     */
    protected readonly _stores: Map<KnowledgeScope, FileStore>;

    /**
     * @param {Partial<Record<KnowledgeScope, FileStore>>} stores - The store for each configured scope.
     */
    public constructor(stores: Partial<Record<KnowledgeScope, FileStore>>) {
        this._stores = new Map<KnowledgeScope, FileStore>();

        for (const scope of PRECEDENCE) {
            const store = stores[scope];

            if (store !== undefined) {
                this._stores.set(scope, store);
            }
        }
    }

    /**
     * Write a lesson to its own scope layer (immutable per id+version).
     * @param {Lesson} lesson - The lesson to store.
     * @returns {Promise<void>}
     * @throws {KyklosError} When no store is configured for the lesson's scope.
     */
    public async putLesson(lesson: Lesson): Promise<void> {
        const store = this._stores.get(lesson.scope);

        if (store === undefined) {
            throw new KyklosError(KyklosErrorCode.InvalidState, `no knowledge store configured for scope '${lesson.scope}'`);
        }

        await store.putDefinition(LESSON_COLLECTION, LessonSchema, lesson);
    }

    /**
     * Read a lesson from a specific scope layer.
     * @param {KnowledgeScope} scope - The scope layer.
     * @param {string} id - Lesson id.
     * @param {string} version - Lesson version.
     * @returns {Promise<Lesson|undefined>} The lesson, or undefined if absent.
     */
    public async getLesson(scope: KnowledgeScope, id: string, version: string): Promise<Lesson|undefined> {
        const store = this._stores.get(scope);

        if (store === undefined) {
            return undefined;
        }

        return LayeredKnowledgeStore._optional(store.getDefinition(LESSON_COLLECTION, id, version, LessonSchema));
    }

    /**
     * Resolve a lesson across layers, most specific first.
     * @param {string} id - Lesson id.
     * @param {string} version - Lesson version.
     * @returns {Promise<ScopedLesson|undefined>} The first matching lesson and its scope.
     */
    public async resolveLesson(id: string, version: string): Promise<ScopedLesson|undefined> {
        for (const scope of PRECEDENCE) {
            // sequential by design — precedence order matters
            // eslint-disable-next-line no-await-in-loop
            const lesson = await this.getLesson(scope, id, version);

            if (lesson !== undefined) {
                return {lesson: lesson, scope: scope};
            }
        }

        return undefined;
    }

    /**
     * List every lesson across all configured layers.
     * @returns {Promise<ScopedLesson[]>} All lessons with their scopes.
     */
    public async all(): Promise<ScopedLesson[]> {
        const result: ScopedLesson[] = [];

        for (const scope of PRECEDENCE) {
            const store = this._stores.get(scope);

            if (store === undefined) {
                continue;
            }

            // sequential by design — deterministic ordered reads
            // eslint-disable-next-line no-await-in-loop
            const lessons = await store.listDefinitions(LESSON_COLLECTION, LessonSchema);

            for (const lesson of lessons) {
                result.push({lesson: lesson, scope: scope});
            }
        }

        return result;
    }

    /**
     * The configured scopes, most specific first.
     * @returns {KnowledgeScope[]} Configured scopes in precedence order.
     */
    public scopes(): KnowledgeScope[] {
        return PRECEDENCE.filter((scope): boolean => this._stores.has(scope));
    }

    /**
     * Resolve a store read to undefined when the entry is not found.
     * @param {Promise<T>} read - The store read.
     * @returns {Promise<T|undefined>} The value, or undefined on NotFound.
     */
    protected static async _optional<T>(read: Promise<T>): Promise<T|undefined> {
        try {
            return await read;
        } catch (error: unknown) {
            if (error instanceof KyklosError && error.code === KyklosErrorCode.NotFound) {
                return undefined;
            }

            throw error;
        }
    }

}