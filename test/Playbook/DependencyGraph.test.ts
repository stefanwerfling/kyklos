import {describe, expect, it} from 'vitest';
import {DependencyGraph} from '../../src/index';

const childrenFrom = (edges: Record<string, string[]>) => {
    return (node: string): string[] => edges[node] ?? [];
};

describe('DependencyGraph.detectCycle', () => {
    it('returns undefined for an acyclic diamond', () => {
        const children = childrenFrom({A: ['B', 'C'], B: ['D'], C: ['D'], D: []});
        expect(DependencyGraph.detectCycle('A', children)).toBeUndefined();
    });

    it('detects a direct self-cycle', () => {
        const children = childrenFrom({A: ['A']});
        expect(DependencyGraph.detectCycle('A', children)).toEqual(['A', 'A']);
    });

    it('detects an indirect cycle', () => {
        const children = childrenFrom({A: ['B'], B: ['C'], C: ['A']});
        expect(DependencyGraph.detectCycle('A', children)).toEqual(['A', 'B', 'C', 'A']);
    });

    it('is deterministic', () => {
        const children = childrenFrom({A: ['B'], B: ['A']});
        expect(DependencyGraph.detectCycle('A', children)).toEqual(DependencyGraph.detectCycle('A', children));
    });
});