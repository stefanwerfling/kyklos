import {describe, expect, it} from 'vitest';
import {AdapterKind, DryRunRegistry} from '../../src/index';

describe('DryRunRegistry', () => {
    it('registers a simulated adapter for every adapter kind', () => {
        const registry = DryRunRegistry.all();

        for (const kind of Object.values(AdapterKind)) {
            expect(registry.has(kind)).toBe(true);
        }
    });

    it('its default outcome is a success with non-empty output (so nonEmpty passes)', () => {
        const outcome = DryRunRegistry.successOutcome();
        expect(outcome.executed).toBe(true);
        expect(outcome.exitCode).toBe(0);
        expect(outcome.stdout.length).toBeGreaterThan(0);
    });
});
