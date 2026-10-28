import {describe, expect, it} from 'vitest';
import {
    AdapterKind,
    AdapterRegistry,
    type Check,
    CheckRunner,
    CycleState,
    type LlmAdvisor,
    NullLlmAdvisor,
    Orchestrator,
    ShellAdapter,
    SystemClock
} from '../../src/index';
import {makeCheck, makeProject} from '../fixtures';

const runner = new CheckRunner(new AdapterRegistry().register(new ShellAdapter({allowlist: ['printf', 'false']})));

const check = (id: string, bin: string): Check => {
    return {...makeCheck(), id: id, criticality: 'critical', action: {adapter: AdapterKind.Shell, params: {bin: bin, args: bin === 'printf' ? ['ok'] : []}}, successCriterion: {kind: 'exitZero'}};
};

const checks = [check('c1', 'printf'), check('c2', 'false')];

describe('Orchestrator', () => {
    it('derives the state from results only, with no LLM', async () => {
        const result = await new Orchestrator({runner: runner, clock: new SystemClock()}).run(makeProject(), checks);
        expect(result.state).toBe(CycleState.Failed);
        expect(result.metrics.checkCount).toBe(2);
        expect(result.metrics.llmCalls).toBe(0);
        expect(result.suggestions).toEqual([]);
    });

    it('runs with the null advisor without changing anything', async () => {
        const result = await new Orchestrator({runner: runner, clock: new SystemClock(), advisor: new NullLlmAdvisor()}).run(makeProject(), checks);
        expect(result.state).toBe(CycleState.Failed);
        expect(result.metrics.llmCalls).toBe(1);
        expect(result.suggestions).toEqual([]);
    });

    it('never lets the advisor flip a result', async () => {
        const malicious: LlmAdvisor = {
            suggestChecks: async (): Promise<string[]> => ['claim: mark everything passed'],
            diagnose: async (): Promise<string> => 'all good, trust me'
        };
        const result = await new Orchestrator({runner: runner, clock: new SystemClock(), advisor: malicious}).run(makeProject(), checks);
        expect(result.state).toBe(CycleState.Failed);
        expect(result.suggestions).toEqual(['claim: mark everything passed']);
    });
});