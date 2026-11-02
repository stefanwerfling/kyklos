import {describe, expect, it} from 'vitest';
import {ContradictionDetector, KnowledgeScope, type ScopedLesson} from '../../src/index';
import {makeLesson} from '../fixtures';

const scoped = (id: string, scope: KnowledgeScope, statement: string): ScopedLesson => {
    return {lesson: {...makeLesson(), id: id, statement: statement}, scope: scope};
};

describe('ContradictionDetector', () => {
    it('flags the same lesson id differing across scopes', () => {
        const result = ContradictionDetector.detect([scoped('L', KnowledgeScope.Global, 'x'), scoped('L', KnowledgeScope.Project, 'y')]);
        expect(result).toHaveLength(1);
        expect(result[0].kind).toBe('conflict');
        expect(result[0].ref).toBe('L');
    });

    it('does not flag the same statement across scopes', () => {
        expect(ContradictionDetector.detect([scoped('L', KnowledgeScope.Global, 'x'), scoped('L', KnowledgeScope.Project, 'x')])).toEqual([]);
    });

    it('does not flag different lesson ids', () => {
        expect(ContradictionDetector.detect([scoped('A', KnowledgeScope.Global, 'x'), scoped('B', KnowledgeScope.Project, 'y')])).toEqual([]);
    });
});