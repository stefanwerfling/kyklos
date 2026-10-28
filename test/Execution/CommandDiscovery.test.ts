import {describe, expect, it} from 'vitest';
import {AdapterKind, CommandDiscovery, Criticality} from '../../src/index';

describe('CommandDiscovery', () => {
    it('discovers recognized scripts, ordered cheap-first', () => {
        const checks = CommandDiscovery.fromPackageJson({
            scripts: {build: 'tsc', test: 'vitest run', lint: 'eslint src', typecheck: 'tsc --noEmit', other: 'x'}
        });
        expect(checks.map((check) => check.id)).toEqual(['cli.lint', 'cli.typecheck', 'cli.test', 'cli.build']);
    });

    it('builds npm run shell actions with exitZero criteria', () => {
        const [lint] = CommandDiscovery.fromPackageJson({scripts: {lint: 'eslint src'}});
        expect(lint.action.adapter).toBe(AdapterKind.Shell);
        expect(lint.action.params).toEqual({bin: 'npm', args: ['run', 'lint']});
        expect(lint.successCriterion.kind).toBe('exitZero');
    });

    it('marks typecheck/test/build critical and lint major', () => {
        const checks = CommandDiscovery.fromPackageJson({scripts: {lint: 'x', typecheck: 'x', test: 'x'}});
        const byId = new Map(checks.map((check) => [check.id, check.criticality]));
        expect(byId.get('cli.lint')).toBe(Criticality.Major);
        expect(byId.get('cli.typecheck')).toBe(Criticality.Critical);
        expect(byId.get('cli.test')).toBe(Criticality.Critical);
    });

    it('invents nothing when there are no scripts', () => {
        expect(CommandDiscovery.fromPackageJson({})).toEqual([]);
    });
});