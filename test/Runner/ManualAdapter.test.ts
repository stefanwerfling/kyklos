import {describe, expect, it} from 'vitest';
import {AdapterKind, ManualAdapter, ManualParamsSchema} from '../../src/index';

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

    it('accepts localized prompts next to the default prompt', async () => {
        const params = {prompt: 'Load the add-on via about:debugging.', prompts: {de: 'Add-on über about:debugging laden.'}};
        expect(ManualParamsSchema.validate(params, [])).toBe(true);
        expect((await adapter.execute({adapter: AdapterKind.Manual, params: params})).executed).toBe(true);
    });

    it('still accepts old definitions with only a prompt', async () => {
        expect(ManualParamsSchema.validate({prompt: 'Do it.'}, [])).toBe(true);
        expect((await adapter.execute({adapter: AdapterKind.Manual, params: {prompt: 'Do it.'}})).executed).toBe(true);
    });

    it('rejects non-string localized prompts', async () => {
        expect(ManualParamsSchema.validate({prompts: {de: 42}}, [])).toBe(false);
        expect(ManualParamsSchema.validate({prompts: 'Add-on laden.'}, [])).toBe(false);
        const outcome = await adapter.execute({adapter: AdapterKind.Manual, params: {prompts: {de: 42}}});
        expect(outcome.executed).toBe(false);
        expect(outcome.reason).toBe('invalid_params');
    });
});

describe('ManualAdapter.selectPrompt', () => {
    const params = {prompt: 'Load the add-on via about:debugging.', prompts: {de: 'Add-on über about:debugging laden.'}};

    it('picks the requested language when present', () => {
        expect(ManualAdapter.selectPrompt(params, 'desc', 'de')).toBe('Add-on über about:debugging laden.');
    });

    it('falls back to the default prompt when the language is missing', () => {
        expect(ManualAdapter.selectPrompt({prompt: 'Default.', prompts: {fr: 'Défaut.'}}, 'desc', 'de')).toBe('Default.');
        expect(ManualAdapter.selectPrompt({prompt: 'Default.'}, 'desc', 'de')).toBe('Default.');
    });

    it('falls back to the default prompt for an unknown language or none', () => {
        expect(ManualAdapter.selectPrompt(params, 'desc', 'xx')).toBe('Load the add-on via about:debugging.');
        expect(ManualAdapter.selectPrompt(params, 'desc', 'en')).toBe('Load the add-on via about:debugging.');
        expect(ManualAdapter.selectPrompt(params, 'desc')).toBe('Load the add-on via about:debugging.');
    });

    it('falls back to the description when there is no prompt', () => {
        expect(ManualAdapter.selectPrompt(undefined, 'desc', 'de')).toBe('desc');
        expect(ManualAdapter.selectPrompt({}, 'desc', 'de')).toBe('desc');
        expect(ManualAdapter.selectPrompt({prompt: ''}, 'desc', 'de')).toBe('desc');
    });

    it('falls back to the description for invalid params', () => {
        expect(ManualAdapter.selectPrompt({prompts: {de: 42}}, 'desc', 'de')).toBe('desc');
    });
});
