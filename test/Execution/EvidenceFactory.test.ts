import {describe, expect, it} from 'vitest';
import {EvidenceFactory, EvidenceSource} from '../../src/index';
import {makeToolExecution} from '../fixtures';

const TS = '2026-10-28T00:00:00.000Z';

describe('EvidenceFactory provenance tiers', () => {
    it('tags tool-execution evidence as tool_execution and hashes the execution', () => {
        const evidence = EvidenceFactory.fromToolExecution(makeToolExecution(), 'ev-1', TS);
        expect(evidence.source).toBe(EvidenceSource.ToolExecution);
        expect(evidence.sha256).toMatch(/^[a-f0-9]{64}$/u);
    });

    it('tags an LLM statement as llm_assertion, never a verified result', () => {
        const evidence = EvidenceFactory.llmAssertion('I believe the build is fine', 'llm', 'ev-2', TS);
        expect(evidence.source).toBe(EvidenceSource.LlmAssertion);
        expect(evidence.source).not.toBe(EvidenceSource.MachineVerified);
    });

    it('records a not-executable check as not_executable evidence', () => {
        const evidence = EvidenceFactory.notExecutable('no AVD; install an emulator', 'emulator', 'ev-3', TS);
        expect(evidence.source).toBe(EvidenceSource.NotExecutable);
        expect(evidence.inline).toContain('no AVD');
    });

    it('is deterministic for the same execution', () => {
        const a = EvidenceFactory.fromToolExecution(makeToolExecution(), 'ev-1', TS);
        const b = EvidenceFactory.fromToolExecution(makeToolExecution(), 'ev-1', TS);
        expect(a).toStrictEqual(b);
    });
});