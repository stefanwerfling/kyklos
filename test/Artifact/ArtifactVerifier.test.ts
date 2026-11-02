import {describe, expect, it} from 'vitest';
import {ArtifactVerifier, DiagnosticKind} from '../../src/index';

const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);

describe('ArtifactVerifier', () => {
    it('matches an observed digest that equals the pinned one', () => {
        const result = ArtifactVerifier.verify(DIGEST_A, DIGEST_A);
        expect(result.match).toBe(true);
        expect(result.diagnostic).toBeUndefined();
    });

    it('reports a conflict when the deployed digest diverges from the tested one', () => {
        const result = ArtifactVerifier.verify(DIGEST_A, DIGEST_B);
        expect(result.match).toBe(false);
        expect(result.diagnostic?.kind).toBe(DiagnosticKind.Conflict);
        expect(result.diagnostic?.ref).toBe(DIGEST_A);
        expect(result.diagnostic?.message).toContain('mismatch');
    });
});
