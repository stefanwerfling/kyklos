import {describe, expect, it} from 'vitest';
import {NullLlmAdvisor} from '../../src/index';

describe('NullLlmAdvisor.proposePlan', () => {
    it('proposes nothing, so the core runs with no LLM', async () => {
        const advisor = new NullLlmAdvisor();
        expect(await advisor.proposePlan('any goal', {projectName: 'p', checkIds: []})).toBeUndefined();
    });
});
