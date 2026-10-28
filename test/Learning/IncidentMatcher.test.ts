import {describe, expect, it} from 'vitest';
import {type Incident, IncidentMatcher} from '../../src/index';
import {makeIncident} from '../fixtures';

const incident = (id: string, signature: string, classification: string): Incident => {
    return {...makeIncident(), id: id, signature: signature, classification: classification};
};

const candidates: Incident[] = [
    incident('inc-b', 'backup:restore:failed', 'backup'),
    incident('inc-a', 'backup:restore:failed', 'backup'),
    incident('inc-c', 'deploy:health:failed', 'deployment')
];

describe('IncidentMatcher', () => {
    it('matches an identical signature and never links unrelated incidents', () => {
        const result = IncidentMatcher.match(candidates, {signature: 'backup:restore:failed'});
        expect(result.map((inc): string => inc.id)).toEqual(['inc-a', 'inc-b']);
    });

    it('returns an empty result for an unknown signature (no false links)', () => {
        expect(IncidentMatcher.match(candidates, {signature: 'does:not:exist'})).toEqual([]);
    });

    it('also filters by classification when given', () => {
        expect(IncidentMatcher.match(candidates, {signature: 'backup:restore:failed', classification: 'deployment'})).toEqual([]);
    });

    it('is deterministic and ordered by id', () => {
        const a = IncidentMatcher.match(candidates, {signature: 'backup:restore:failed'});
        const b = IncidentMatcher.match(candidates, {signature: 'backup:restore:failed'});
        expect(a).toEqual(b);
        expect(a.map((inc): string => inc.id)).toEqual(['inc-a', 'inc-b']);
    });
});