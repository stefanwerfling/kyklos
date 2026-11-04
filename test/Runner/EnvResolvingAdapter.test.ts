import {describe, expect, it} from 'vitest';
import {type Adapter, type AdapterOutcome, AdapterKind, type CheckAction, EnvResolvingAdapter, ManualAdapter} from '../../src/index';

/**
 * A delegate that records the (already-resolved) action it was handed.
 */
class CapturingAdapter implements Adapter {
    public readonly kind: AdapterKind = AdapterKind.Shell;
    public seen: CheckAction|undefined = undefined;

    public execute(action: CheckAction): Promise<AdapterOutcome> {
        this.seen = action;
        return Promise.resolve({executed: true, exitCode: 0, stdout: 'ok'});
    }
}

describe('EnvResolvingAdapter', () => {
    it('substitutes ${VAR} in params before delegating', async () => {
        const delegate = new CapturingAdapter();
        const adapter = new EnvResolvingAdapter(delegate, {IMAGE: 'mwpa:1.0.46', DIR: '/srv/mwpa'});
        await adapter.execute({adapter: AdapterKind.Shell, params: {bin: 'docker', args: ['build', '-t', '${IMAGE}', '${DIR}']}});

        const params = delegate.seen?.params as {args: string[];};
        expect(params.args).toEqual(['build', '-t', 'mwpa:1.0.46', '/srv/mwpa']);
    });

    it('is not executable when a placeholder is unresolved (fail-closed)', async () => {
        const delegate = new CapturingAdapter();
        const adapter = new EnvResolvingAdapter(delegate, {});
        const outcome = await adapter.execute({adapter: AdapterKind.Shell, params: {bin: 'docker', args: ['${MISSING}']}});

        expect(outcome.executed).toBe(false);
        expect(outcome.reason).toContain('unresolved_var');
        expect(delegate.seen).toBeUndefined();
    });

    it('substitutes ${VAR} inside localized manual prompts', async () => {
        const delegate = new CapturingAdapter();
        const adapter = new EnvResolvingAdapter(delegate, {URL: 'about:debugging'});
        await adapter.execute({adapter: AdapterKind.Manual, params: {prompt: 'Open ${URL}.', prompts: {de: '${URL} öffnen.'}}});

        const params = delegate.seen?.params as {prompt: string; prompts: Record<string, string>;};
        expect(params.prompt).toBe('Open about:debugging.');
        expect(params.prompts.de).toBe('about:debugging öffnen.');
    });

    it('is not executable when a placeholder in a localized prompt is unresolved', async () => {
        const adapter = new EnvResolvingAdapter(new ManualAdapter(), {URL: 'about:debugging'});
        const outcome = await adapter.execute({adapter: AdapterKind.Manual, params: {prompt: 'Open ${URL}.', prompts: {de: '${MISSING} öffnen.'}}});

        expect(outcome.executed).toBe(false);
        expect(outcome.reason).toBe('unresolved_var: ${MISSING}');
    });
});
