import {describe, expect, it} from 'vitest';
import {type AdapterOutcome, CheckStatus, SuccessCriterionEvaluator} from '../../src/index';

const evalBody = (body: unknown): CheckStatus => {
    const outcome: AdapterOutcome = {executed: true, body: JSON.stringify(body)};
    return SuccessCriterionEvaluator.evaluate({kind: 'browserHealthy'}, outcome).status;
};

describe('browserHealthy strict validation (reproduction)', () => {
    it('is unknown when consoleErrors/failedRequests are missing (not passed)', () => {
        expect(evalBody({reachable: true, title: 'X'})).toBe(CheckStatus.Unknown);
    });

    it('is unknown when a field has the wrong type', () => {
        expect(evalBody({reachable: true, consoleErrors: 'none', failedRequests: []})).toBe(CheckStatus.Unknown);
    });

    it('a reachable-only document does not pass a full UI check', () => {
        expect(evalBody({reachable: true})).toBe(CheckStatus.Unknown);
    });
});