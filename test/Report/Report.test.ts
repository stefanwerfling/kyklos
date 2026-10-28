import {describe, expect, it} from 'vitest';
import {type Deviation, HtmlReportRenderer, ReportBuilder} from '../../src/index';
import {makeCycle, makeDeviation, makeIncident, makeObservation, makeReleaseDecision} from '../fixtures';

const baseInput = () => {
    return {
        cycle: makeCycle(),
        observations: [makeObservation()],
        deviations: [makeDeviation()],
        decision: makeReleaseDecision(),
        priorIncidents: [makeIncident()]
    };
};

describe('ReportBuilder', () => {
    it('links each check to the deviations it produced', () => {
        const report = ReportBuilder.build(baseInput());
        expect(report.state).toBe('failed');
        expect(report.checks[0].deviationIds).toEqual(['dev-1']);
    });

    it('derives open risks from non-passing checks', () => {
        const report = ReportBuilder.build(baseInput());
        expect(report.openRisks).toContain('backup.restore-test: failed');
    });
});

describe('HtmlReportRenderer', () => {
    it('renders the cycle, checks, decision and a deviation link', () => {
        const html = HtmlReportRenderer.render(ReportBuilder.build(baseInput()));
        expect(html).toContain('cyc-1');
        expect(html).toContain('backup.restore-test');
        expect(html).toContain('href="#dev-dev-1"');
        expect(html).toContain('reject');
    });

    it('escapes untrusted content instead of emitting markup', () => {
        const evil: Deviation = {...makeDeviation(), signature: '<script>alert(1)</script>'};
        const html = HtmlReportRenderer.render(ReportBuilder.build({cycle: makeCycle(), observations: [makeObservation()], deviations: [evil]}));
        expect(html).not.toContain('<script>alert(1)</script>');
        expect(html).toContain('&lt;script&gt;');
    });

    it('is deterministic for the same report', () => {
        const report = ReportBuilder.build(baseInput());
        expect(HtmlReportRenderer.render(report)).toBe(HtmlReportRenderer.render(report));
    });
});