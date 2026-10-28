/**
 * ReportBuilder — assembles a deterministic, machine-readable cycle report.
 *
 * It joins a cycle's observations, deviations, release decision and similar
 * prior incidents into one structure, links each check to the deviations it
 * produced, and derives the open risks (any non-passing check, plus a
 * manual-release gate). No time is read here; the report is a pure function of
 * its inputs.
 */
import {CheckStatus, CycleState} from '../Domain/Common.js';
import {Cycle} from '../Domain/Cycle.js';
import {Deviation} from '../Domain/Deviation.js';
import {Incident} from '../Domain/Incident.js';
import {Observation} from '../Domain/Observation.js';
import {ReleaseDecision} from '../Domain/ReleaseDecision.js';

/**
 * A single check line in a report.
 */
export interface ReportCheckLine {

    /**
     * The observation id.
     * @member {string}
     */
    observationId: string;

    /**
     * The check id.
     * @member {string}
     */
    checkId: string;

    /**
     * The resulting status.
     * @member {CheckStatus}
     */
    status: CheckStatus;

    /**
     * A short reason for the status.
     * @member {string}
     */
    reason: string;

    /**
     * Evidence ids backing this observation.
     * @member {string[]}
     */
    evidenceIds: string[];

    /**
     * Deviation ids produced by this observation.
     * @member {string[]}
     */
    deviationIds: string[];
}

/**
 * A full, machine-readable cycle report.
 */
export interface CycleReport {

    /**
     * The cycle id.
     * @member {string}
     */
    cycleId: string;

    /**
     * The project id.
     * @member {string}
     */
    projectId: string;

    /**
     * The terminal cycle state.
     * @member {CycleState}
     */
    state: CycleState;

    /**
     * The per-check lines.
     * @member {ReportCheckLine[]}
     */
    checks: ReportCheckLine[];

    /**
     * The deviations.
     * @member {Deviation[]}
     */
    deviations: Deviation[];

    /**
     * The release decision, if one was made.
     * @member {ReleaseDecision|undefined}
     */
    decision?: ReleaseDecision;

    /**
     * Similar prior incidents.
     * @member {Incident[]}
     */
    priorIncidents: Incident[];

    /**
     * Open risks (non-passing checks and gates).
     * @member {string[]}
     */
    openRisks: string[];
}

/**
 * The raw inputs for a report.
 */
export interface ReportInput {

    /**
     * The cycle record.
     * @member {Cycle}
     */
    cycle: Cycle;

    /**
     * The observations.
     * @member {Observation[]}
     */
    observations: Observation[];

    /**
     * The deviations.
     * @member {Deviation[]}
     */
    deviations: Deviation[];

    /**
     * The release decision, if any.
     * @member {ReleaseDecision|undefined}
     */
    decision?: ReleaseDecision;

    /**
     * Similar prior incidents, if any.
     * @member {Incident[]|undefined}
     */
    priorIncidents?: Incident[];
}

const PASSING = new Set<CheckStatus>([CheckStatus.Passed, CheckStatus.NotApplicable]);

/**
 * Static builder of cycle reports.
 */
export class ReportBuilder {

    /**
     * Build a report from a cycle's records.
     * @param {ReportInput} input - The cycle, observations, deviations and extras.
     * @returns {CycleReport} The assembled report.
     */
    public static build(input: ReportInput): CycleReport {
        const checks = input.observations.map((observation): ReportCheckLine => {
            return {
                observationId: observation.id,
                checkId: observation.checkId,
                status: observation.status,
                reason: ReportBuilder._reason(observation),
                evidenceIds: observation.evidenceIds,
                deviationIds: input.deviations
                .filter((deviation): boolean => deviation.observationId === observation.id)
                .map((deviation): string => deviation.id)
            };
        });

        return {
            cycleId: input.cycle.id,
            projectId: input.cycle.projectId,
            state: input.cycle.state,
            checks: checks,
            deviations: input.deviations,
            decision: input.decision,
            priorIncidents: input.priorIncidents ?? [],
            openRisks: ReportBuilder._openRisks(input.cycle.state, checks)
        };
    }

    /**
     * Derive a short reason from an observation.
     * @param {Observation} observation - The observation.
     * @returns {string} A short reason string.
     */
    protected static _reason(observation: Observation): string {
        const actual = observation.actual;

        if (actual !== null && typeof actual === 'object' && 'reason' in actual) {
            const reason = (actual as {reason: unknown;}).reason;

            if (typeof reason === 'string' && reason.length > 0) {
                return reason;
            }
        }

        return observation.status;
    }

    /**
     * Derive the open risks from the state and check lines.
     * @param {CycleState} state - The terminal cycle state.
     * @param {ReportCheckLine[]} checks - The check lines.
     * @returns {string[]} Open-risk notes.
     */
    protected static _openRisks(state: CycleState, checks: ReportCheckLine[]): string[] {
        const risks = checks
        .filter((check): boolean => !PASSING.has(check.status))
        .map((check): string => `${check.checkId}: ${check.status}`);

        if (state === CycleState.ManualReleaseRequired) {
            risks.push('manual_release_required: a critical check needs an authorized decision');
        }

        return risks;
    }

}