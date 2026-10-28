import {describe, expect, it} from 'vitest';
import {KYKLOS_VERSION} from '../src/index';

describe('kyklos package entry', () => {
    it('exposes a semver-shaped version', () => {
        expect(KYKLOS_VERSION).toMatch(/^\d+\.\d+\.\d+$/u);
    });
});
