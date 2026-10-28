import {describe, expect, it} from 'vitest';
import {SignatureBuilder} from '../../src/index';

describe('SignatureBuilder', () => {
    it('is deterministic for identical input', () => {
        expect(SignatureBuilder.build(['backup', 'backup.create', 'failed']))
            .toBe(SignatureBuilder.build(['backup', 'backup.create', 'failed']));
    });

    it('produces a readable joined signature', () => {
        expect(SignatureBuilder.build(['backup', 'backup.create', 'failed'])).toBe('backup:backup.create:failed');
    });

    it('normalizes case and whitespace so cosmetic differences do not mismatch', () => {
        expect(SignatureBuilder.build(['Backup', '  backup.create ', 'FAILED']))
            .toBe(SignatureBuilder.build(['backup', 'backup.create', 'failed']));
        expect(SignatureBuilder.build(['a b', 'c'])).toBe('a_b:c');
    });

    it('differs for different input', () => {
        expect(SignatureBuilder.build(['backup', 'x', 'failed']))
            .not.toBe(SignatureBuilder.build(['backup', 'y', 'failed']));
    });
});