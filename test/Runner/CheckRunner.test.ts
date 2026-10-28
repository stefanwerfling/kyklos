import {describe, expect, it} from 'vitest';
import {
    AdapterKind,
    AdapterRegistry,
    type Check,
    CheckRunner,
    CheckStatus,
    ManualAdapter,
    ShellAdapter
} from '../../src/index';
import {makeCheck} from '../fixtures';

const registry = new AdapterRegistry()
    .register(new ManualAdapter())
    .register(new ShellAdapter({allowlist: ['printf', 'false']}));
const runner = new CheckRunner(registry);

const shellCheck = (bin: string, kind: string): Check => {
    return {...makeCheck(), action: {adapter: AdapterKind.Shell, params: {bin: bin}}, successCriterion: {kind: kind}};
};

const manualCheck = (): Check => {
    return {...makeCheck(), action: {adapter: AdapterKind.Manual}, successCriterion: {kind: 'manualConfirm'}};
};

describe('CheckRunner produces each of the six statuses', () => {
    it('passed', async () => {
        const result = await runner.run({...shellCheck('printf', 'exitZero'), action: {adapter: AdapterKind.Shell, params: {bin: 'printf', args: ['ok']}}});
        expect(result.status).toBe(CheckStatus.Passed);
    });

    it('failed', async () => {
        expect((await runner.run(shellCheck('false', 'exitZero'))).status).toBe(CheckStatus.Failed);
    });

    it('not_executable (binary not allow-listed)', async () => {
        expect((await runner.run(shellCheck('rm', 'exitZero'))).status).toBe(CheckStatus.NotExecutable);
    });

    it('unknown (unanswered manual step)', async () => {
        expect((await runner.run(manualCheck())).status).toBe(CheckStatus.Unknown);
    });

    it('skipped', async () => {
        expect((await runner.run(shellCheck('printf', 'exitZero'), {skip: true})).status).toBe(CheckStatus.Skipped);
    });

    it('not_applicable', async () => {
        expect((await runner.run(shellCheck('printf', 'exitZero'), {applicable: false})).status).toBe(CheckStatus.NotApplicable);
    });

    it('not_executable when no adapter is registered for the kind', async () => {
        expect((await runner.run({...makeCheck(), action: {adapter: AdapterKind.Decision}, successCriterion: {kind: 'exitZero'}})).status).toBe(CheckStatus.NotExecutable);
    });
});

describe('CheckRunner determinism', () => {
    it('yields the same result for the same input', async () => {
        const check: Check = {...makeCheck(), action: {adapter: AdapterKind.Shell, params: {bin: 'printf', args: ['ok']}}, successCriterion: {kind: 'regex', params: {pattern: '^ok$'}}};
        const a = await runner.run(check);
        const b = await runner.run(check);
        expect(a).toStrictEqual(b);
        expect(a.status).toBe(CheckStatus.Passed);
    });
});