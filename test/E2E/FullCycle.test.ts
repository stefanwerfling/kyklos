import {describe, expect, it} from 'vitest';
import {
    type AdapterOutcome,
    type CheckAction,
    CheckRunner,
    CommandDiscovery,
    CycleEngine,
    CycleState,
    DryRunAdapter,
    AdapterKind,
    AdapterRegistry,
    HtmlReportRenderer,
    ReleaseGate,
    ReleaseOutcome,
    ReportBuilder
} from '../../src/index';
import {makeProcedure, makeProject} from '../fixtures';
import {FixedClock, SequentialIdGenerator} from '../doubles';

const manifest = {scripts: {lint: 'eslint src', typecheck: 'tsc --noEmit', test: 'vitest run', build: 'tsc'}};

const engineWith = (resolver?: (action: CheckAction) => AdapterOutcome): CycleEngine => {
    const registry = new AdapterRegistry().register(new DryRunAdapter(AdapterKind.Shell, resolver));
    return new CycleEngine({runner: new CheckRunner(registry), idGenerator: new SequentialIdGenerator(), clock: new FixedClock()});
};

const checklistFrom = (manifestInput: {scripts: Record<string, string>;}) => {
    return {id: 'cli.discovered', version: '1.0.0', ruleVersion: '1.0.0', checks: CommandDiscovery.fromPackageJson(manifestInput)};
};

describe('E2E: discovery -> engine -> gatekeeping -> report -> render -> release', () => {
    it('a clean run approves and renders an auditable report', async () => {
        const result = await engineWith().run({project: makeProject(), procedure: makeProcedure(), checklist: checklistFrom(manifest)});
        expect(result.cycle.state).toBe(CycleState.Passed);
        expect(result.observations).toHaveLength(4);

        const decision = ReleaseGate.decide({cycle: result.cycle, ruleVersion: '1.0.0', decidedBy: 'gate', idGenerator: new SequentialIdGenerator(), clock: new FixedClock()});
        expect(decision.outcome).toBe(ReleaseOutcome.Approve);

        const report = ReportBuilder.build({cycle: result.cycle, observations: result.observations, deviations: result.deviations, decision: decision});
        expect(report.openRisks).toEqual([]);

        const html = HtmlReportRenderer.render(report);
        expect(html).toContain('cli.lint');
        expect(html).toContain('approve');
    });

    it('a failing run blocks and the report shows the open risks', async () => {
        const failAll = (): AdapterOutcome => {
            return {executed: true, exitCode: 1};
        };
        const result = await engineWith(failAll).run({project: makeProject(), procedure: makeProcedure(), checklist: checklistFrom(manifest)});
        expect(result.cycle.state).toBe(CycleState.Failed);

        const decision = ReleaseGate.decide({cycle: result.cycle, ruleVersion: '1.0.0', decidedBy: 'gate', idGenerator: new SequentialIdGenerator(), clock: new FixedClock()});
        expect(decision.outcome).toBe(ReleaseOutcome.Reject);

        const report = ReportBuilder.build({cycle: result.cycle, observations: result.observations, deviations: result.deviations, decision: decision});
        expect(report.openRisks.length).toBeGreaterThan(0);
        expect(HtmlReportRenderer.render(report)).toContain('reject');
    });
});