import {describe, expect, it} from 'vitest';
import {PermissionPolicy, PermissionTier} from '../../src/index';

describe('PermissionPolicy fail-closed (reproduction)', () => {
    it('denies an unknown/manipulated tier value instead of allowing it', () => {
        const policy = new PermissionPolicy(PermissionTier.Read);
        // Simulate manipulated runtime data: a value that is not a real tier.
        const forged = 'root' as unknown as PermissionTier;
        expect(policy.allows(forged)).toBe(false);
    });

    it('rejects construction with an unknown max tier', () => {
        const forgedMax = 'superuser' as unknown as PermissionTier;
        expect(() => new PermissionPolicy(forgedMax)).toThrowError();
    });
});