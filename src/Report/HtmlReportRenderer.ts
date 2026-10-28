/**
 * HtmlReportRenderer — renders a CycleReport to a self-contained HTML page.
 *
 * All dynamic text is HTML-escaped: content from repos, logs and test output is
 * untrusted data, never markup. Failing checks link to their deviation anchors,
 * so a reviewer can go from a result straight to its analysis. Output is
 * deterministic for a given report.
 */
import {CheckStatus} from '../Domain/Common.js';
import {CycleReport, ReportCheckLine} from './ReportBuilder.js';

const PASSING = new Set<CheckStatus>([CheckStatus.Passed, CheckStatus.NotApplicable]);

/**
 * Static renderer of cycle reports to HTML.
 */
export class HtmlReportRenderer {

    /**
     * Render a report to a self-contained HTML string.
     * @param {CycleReport} report - The report to render.
     * @returns {string} A complete HTML document.
     */
    public static render(report: CycleReport): string {
        const rows = report.checks.map((check): string => HtmlReportRenderer._checkRow(check)).join('');
        const deviations = report.deviations.map((deviation): string => {
            return `<section id="dev-${HtmlReportRenderer._esc(deviation.id)}"><h3>Deviation ${HtmlReportRenderer._esc(deviation.id)}</h3>`
                + `<p>signature: <code>${HtmlReportRenderer._esc(deviation.signature)}</code> · severity: ${HtmlReportRenderer._esc(deviation.severity)}</p></section>`;
        }).join('');
        const risks = report.openRisks.map((risk): string => `<li>${HtmlReportRenderer._esc(risk)}</li>`).join('');
        const priors = report.priorIncidents.map((incident): string => `<li><code>${HtmlReportRenderer._esc(incident.signature)}</code> (${HtmlReportRenderer._esc(incident.id)})</li>`).join('');
        const decision = report.decision === undefined
            ? '<p>no decision recorded</p>'
            : `<p>outcome: <strong>${HtmlReportRenderer._esc(report.decision.outcome)}</strong> — ${HtmlReportRenderer._esc(report.decision.rationale)} (rule ${HtmlReportRenderer._esc(report.decision.ruleVersion)})</p>`;

        return '<!doctype html><html lang="en"><head><meta charset="utf-8">'
            + `<title>Kyklos cycle ${HtmlReportRenderer._esc(report.cycleId)}</title></head><body>`
            + '<h1>Kyklos cycle report</h1>'
            + `<p>cycle <code>${HtmlReportRenderer._esc(report.cycleId)}</code> · project <code>${HtmlReportRenderer._esc(report.projectId)}</code> · state <strong>${HtmlReportRenderer._esc(report.state)}</strong></p>`
            + `<h2>Checks</h2><table><thead><tr><th>check</th><th>status</th><th>reason</th><th>analysis</th></tr></thead><tbody>${rows}</tbody></table>`
            + `<h2>Deviations</h2>${deviations.length > 0 ? deviations : '<p>none</p>'}`
            + `<h2>Release decision</h2>${decision}`
            + `<h2>Similar prior incidents</h2><ul>${priors.length > 0 ? priors : '<li>none</li>'}</ul>`
            + `<h2>Open risks</h2><ul>${risks.length > 0 ? risks : '<li>none</li>'}</ul>`
            + '</body></html>';
    }

    /**
     * Render one check row, linking failing checks to their deviations.
     * @param {ReportCheckLine} check - The check line.
     * @returns {string} A table row.
     */
    protected static _checkRow(check: ReportCheckLine): string {
        const analysis = HtmlReportRenderer._analysisCell(check);

        return `<tr><td><code>${HtmlReportRenderer._esc(check.checkId)}</code></td>`
            + `<td>${HtmlReportRenderer._esc(check.status)}</td>`
            + `<td>${HtmlReportRenderer._esc(check.reason)}</td>`
            + `<td>${analysis}</td></tr>`;
    }

    /**
     * Render the analysis cell: deviation links, or ok/— for a non-deviating check.
     * @param {ReportCheckLine} check - The check line.
     * @returns {string} The analysis cell HTML.
     */
    protected static _analysisCell(check: ReportCheckLine): string {
        if (check.deviationIds.length > 0) {
            return check.deviationIds.map((id): string => `<a href="#dev-${HtmlReportRenderer._esc(id)}">${HtmlReportRenderer._esc(id)}</a>`).join(' ');
        }

        return PASSING.has(check.status) ? 'ok' : '—';
    }

    /**
     * Escape a string for safe inclusion in HTML.
     * @param {string} text - The raw text.
     * @returns {string} The escaped text.
     */
    protected static _esc(text: string): string {
        return text
        .replace(/&/gu, '&amp;')
        .replace(/</gu, '&lt;')
        .replace(/>/gu, '&gt;')
        .replace(/"/gu, '&quot;')
        .replace(/'/gu, '&#39;');
    }

}