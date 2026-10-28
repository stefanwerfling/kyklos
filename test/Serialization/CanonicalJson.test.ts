import {describe, expect, it} from 'vitest';
import {CanonicalJson, Checksum} from '../../src/index';

describe('CanonicalJson', () => {
    it('produces identical text regardless of key insertion order', () => {
        const a = {b: 1, a: 2, c: {y: 1, x: 2}};
        const b = {c: {x: 2, y: 1}, a: 2, b: 1};
        expect(CanonicalJson.stringify(a)).toBe(CanonicalJson.stringify(b));
    });

    it('sorts keys deterministically', () => {
        expect(CanonicalJson.stringify({b: 1, a: 2})).toBe('{"a":2,"b":1}');
    });

    it('preserves array order', () => {
        expect(CanonicalJson.stringify([3, 1, 2])).toBe('[3,1,2]');
    });

    it('yields a reproducible checksum for reordered-but-equal values', () => {
        const a = {name: 'kyklos', tags: ['a', 'b']};
        const b = {tags: ['a', 'b'], name: 'kyklos'};
        expect(Checksum.sha256OfValue(a)).toBe(Checksum.sha256OfValue(b));
    });
});