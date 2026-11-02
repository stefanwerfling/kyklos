/**
 * ContradictionDetector — surfaces cross-scope knowledge conflicts.
 *
 * When the same lesson id exists at more than one scope with differing
 * statements, that is a contradiction: the more specific layer wins for use, but
 * the conflict is reported as a diagnostic rather than silently overridden.
 * Pure and deterministic (results ordered by id).
 */
import {DiagnosticKind} from '../Domain/Common.js';
import {Diagnostic} from '../Domain/ExecutionPlan.js';
import {ScopedLesson} from './LayeredKnowledgeStore.js';

/**
 * Static detector of cross-scope lesson contradictions.
 */
export class ContradictionDetector {

    /**
     * Detect contradictions across scoped lessons.
     * @param {ScopedLesson[]} lessons - Lessons with their scopes.
     * @returns {Diagnostic[]} One conflict diagnostic per contradicting lesson id.
     */
    public static detect(lessons: ScopedLesson[]): Diagnostic[] {
        const byId = new Map<string, ScopedLesson[]>();

        for (const scoped of lessons) {
            const group = byId.get(scoped.lesson.id) ?? [];
            group.push(scoped);
            byId.set(scoped.lesson.id, group);
        }

        const diagnostics: Diagnostic[] = [];

        for (const [id, group] of byId) {
            const statements = new Set(group.map((scoped): string => scoped.lesson.statement));
            const scopes = new Set(group.map((scoped): string => scoped.scope));

            if (statements.size > 1 && scopes.size > 1) {
                diagnostics.push({kind: DiagnosticKind.Conflict, message: `lesson '${id}' differs across scopes: ${[...scopes].sort().join(', ')}`, ref: id});
            }
        }

        return diagnostics.sort((left, right): number => (left.ref ?? '').localeCompare(right.ref ?? ''));
    }

}