import {describe, expect, it} from 'vitest';
import {
    AdapterKind,
    BrowserAdapter,
    type BrowserDriver,
    type BrowserInspection,
    CheckStatus,
    PermissionTier,
    SuccessCriterionEvaluator
} from '../../src/index';

const driverOf = (inspection: BrowserInspection): BrowserDriver => {
    return {inspect: async (): Promise<BrowserInspection> => inspection};
};

const healthy: BrowserInspection = {reachable: true, httpStatus: 200, title: 'Kyklos', consoleErrors: [], failedRequests: []};
const action = {adapter: AdapterKind.Browser, params: {url: 'http://localhost/'}};

describe('BrowserAdapter', () => {
    it('declares the external permission tier', () => {
        expect(new BrowserAdapter().permissionTier).toBe(PermissionTier.External);
    });

    it('is not executable without a driver and names a concrete alternative', async () => {
        const outcome = await new BrowserAdapter().execute(action);
        expect(outcome.executed).toBe(false);
        expect(outcome.reason).toContain('playwright');
    });

    it('is not executable when the page is unreachable', async () => {
        const outcome = await new BrowserAdapter(driverOf({reachable: false, consoleErrors: [], failedRequests: []})).execute(action);
        expect(outcome.executed).toBe(false);
        expect(outcome.reason).toBe('unreachable');
    });

    it('passes browserHealthy for a clean page', async () => {
        const outcome = await new BrowserAdapter(driverOf(healthy)).execute(action);
        expect(outcome.executed).toBe(true);
        const result = SuccessCriterionEvaluator.evaluate({kind: 'browserHealthy', params: {expectTitle: 'Kyklos'}}, outcome);
        expect(result.status).toBe(CheckStatus.Passed);
    });

    it('fails browserHealthy when the console has errors (200 alone is not proof)', async () => {
        const outcome = await new BrowserAdapter(driverOf({...healthy, consoleErrors: ['TypeError: x is undefined']})).execute(action);
        const result = SuccessCriterionEvaluator.evaluate({kind: 'browserHealthy'}, outcome);
        expect(result.status).toBe(CheckStatus.Failed);
        expect(result.reason).toContain('browser_errors');
    });

    it('fails browserHealthy on a title mismatch', async () => {
        const outcome = await new BrowserAdapter(driverOf({...healthy, title: 'Other'})).execute(action);
        const result = SuccessCriterionEvaluator.evaluate({kind: 'browserHealthy', params: {expectTitle: 'Kyklos'}}, outcome);
        expect(result.status).toBe(CheckStatus.Failed);
        expect(result.reason).toContain('title_mismatch');
    });
});