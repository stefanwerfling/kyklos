/**
 * FixCycle — the deterministic frame around a fix.
 *
 * It reproduces the original failure, looks up similar prior incidents, lets an
 * external, minimal change be applied (the change itself stays in the approved
 * scope of whoever supplies it), then re-runs the same check and re-evaluates
 * whether the original deviation is actually gone. A fix that cannot be
 * reproduced first is never claimed as verified.
 */
import {Check} from '../Domain/Check.js';
import {CheckStatus} from '../Domain/Common.js';
import {Incident} from '../Domain/Incident.js';
import {CheckRunner} from '../Runner/CheckRunner.js';
import {IncidentRepository} from './IncidentRepository.js';

/**
 * Inputs for a fix attempt.
 */
export interface FixAttemptInput {

    /**
     * The failing check to fix and re-verify.
     * @member {Check}
     */
    check: Check;

    /**
     * Runner used to execute the check.
     * @member {CheckRunner}
     */
    runner: CheckRunner;

    /**
     * The original failing status to reproduce.
     * @member {CheckStatus}
     */
    originalStatus: CheckStatus;

    /**
     * The minimal, external change to apply between reproduce and re-verify.
     * @member {() => Promise<void>}
     */
    applyFix: () => Promise<void>;

    /**
     * Optional incident repository to search for similar prior cases.
     * @member {IncidentRepository|undefined}
     */
    incidentRepository?: IncidentRepository;

    /**
     * Optional signature to search prior incidents by.
     * @member {string|undefined}
     */
    signature?: string;

    /**
     * Optional classification to narrow the prior-incident search.
     * @member {string|undefined}
     */
    classification?: string;
}

/**
 * The outcome of a fix attempt.
 */
export interface FixReport {

    /**
     * Whether the original failure reproduced before the fix.
     * @member {boolean}
     */
    reproduced: boolean;

    /**
     * The status observed when reproducing.
     * @member {CheckStatus}
     */
    reproducedStatus: CheckStatus;

    /**
     * Similar prior incidents found.
     * @member {Incident[]}
     */
    priorIncidents: Incident[];

    /**
     * The status observed after the fix.
     * @member {CheckStatus}
     */
    postFixStatus: CheckStatus;

    /**
     * Whether the original deviation is resolved (post-fix status is passed).
     * @member {boolean}
     */
    resolved: boolean;

    /**
     * Residual risk note.
     * @member {string}
     */
    residualRisk: string;
}

/**
 * Static orchestrator of reproduce-fix-reverify.
 */
export class FixCycle {

    /**
     * Run a full reproduce-fix-reverify attempt.
     * @param {FixAttemptInput} input - The fix attempt inputs.
     * @returns {Promise<FixReport>} The structured fix report.
     */
    public static async run(input: FixAttemptInput): Promise<FixReport> {
        const reproduction = await input.runner.run(input.check);
        const reproduced = reproduction.status === input.originalStatus;

        const priorIncidents = input.incidentRepository !== undefined && input.signature !== undefined
            ? await input.incidentRepository.findSimilar({signature: input.signature, classification: input.classification})
            : [];

        await input.applyFix();

        const afterFix = await input.runner.run(input.check);
        const resolved = reproduced && afterFix.status === CheckStatus.Passed;

        return {
            reproduced: reproduced,
            reproducedStatus: reproduction.status,
            priorIncidents: priorIncidents,
            postFixStatus: afterFix.status,
            resolved: resolved,
            residualRisk: FixCycle._residualRisk(reproduced, resolved, afterFix.status)
        };
    }

    /**
     * Describe the residual risk after a fix attempt.
     * @param {boolean} reproduced - Whether the original failure reproduced.
     * @param {boolean} resolved - Whether the deviation is resolved.
     * @param {CheckStatus} postFixStatus - The post-fix status.
     * @returns {string} A residual-risk note.
     */
    protected static _residualRisk(reproduced: boolean, resolved: boolean, postFixStatus: string): string {
        if (!reproduced) {
            return 'not_reproducible: the fix cannot be verified against the original failure';
        }

        if (resolved) {
            return 'none';
        }

        return `unresolved: check is still ${postFixStatus}`;
    }

}