import {describe, expect, it} from 'vitest';
import {AdapterKind, ManualAdapter} from '../../src/index';

const adapter = new ManualAdapter();

describe('ManualAdapter', () => {
    it('returns an unanswered outcome when no confirmation is seeded', async () => {
        const outcome = await adapter.execute({adapter: AdapterKind.Manual});
        expect(outcome.executed).toBe(true);
        expect(outcome.confirmed).toBeUndefined();
    });

    it('carries a seeded confirmation', async () => {
        expect((await adapter.execute({adapter: AdapterKind.Manual, params: {confirmed: true}})).confirmed).toBe(true);
        expect((await adapter.execute({adapter: AdapterKind.Manual, params: {confirmed: false}})).confirmed).toBe(false);
    });

    it('rejects invalid params', async () => {
        const outcome = await adapter.execute({adapter: AdapterKind.Manual, params: {confirmed: 'yes'}});
        expect(outcome.executed).toBe(false);
        expect(outcome.reason).toBe('invalid_params');
    });
});