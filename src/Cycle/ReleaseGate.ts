/**
 * ReleaseGate — turns a terminal cycle state into a traceable ReleaseDecision.
 *
 * Safe defaults: passing states are approved; failed and manual_release_required
 * are rejected unless an authorized, justified override is supplied. An override
 * records who decided and why, so every exception stays auditable. The gate
 * never approves a blocked state without an override.
 */
import {CycleState, ReleaseOutcome} from '../Domain/Common.js';
import {Cycle} from '../Domain/Cycle.js';
import {ReleaseDecision} from '../Domain/ReleaseDecision.js';
import {KyklosError, KyklosErrorCode} from '../KyklosError.js';
import {Clock} from './Clock.js';
import {IdGenerator} from './IdGenerator.js';

/**
 * An authorized, justified override of a blocked release.
 */
export interface ReleaseOverride {

    /**
     * Identity of the authorized decider.
     * @member {string}
     */
    decidedBy: string;

    /**
     * Justification for overriding the block.
     * @member {string}
     */
    justification: string;
}

/**
 * Input of a release decision.
 */
export interface ReleaseDecisionInput {

    /**
     * The decided cycle.
     * @member {Cycle}
     */
    cycle: Cycle;

    /**
     * Rule version in force for this decision.
     * @member {string}
     */
    ruleVersion: string;

    /**
     * Default decider identity (used when there is no override).
     * @member {string}
     */
    decidedBy: string;

    /**
     * Injected id source.
     * @member {IdGenerator}
     */
    idGenerator: IdGenerator;

    /**
     * Injected time source.
     * @member {Clock}
     */
    clock: Clock;

    /**
     * Optional authorized override of a blocked state.
     * @member {ReleaseOverride|undefined}
     */
    override?: ReleaseOverride;

    /**
     * Optional supporting evidence ids.
     * @member {string[]|undefined}
     */
    evidenceIds?: string[];
}

/**
 * Static gate that produces release decisions from cycle states.
 */
export class ReleaseGate {

    /**
     * Decide the release for a cycle.
     * @param {ReleaseDecisionInput} input - Cycle, rule version, decider and optional override.
     * @returns {ReleaseDecision} The traceable decision.
     */
    public static decide(input: ReleaseDecisionInput): ReleaseDecision {
        switch (input.cycle.state) {
            case CycleState.Passed:
            case CycleState.PassedWithDeviations:
                return ReleaseGate._build(input, ReleaseOutcome.Approve, 'all mandatory checks satisfied', []);
            case CycleState.Aborted:
                return ReleaseGate._build(input, ReleaseOutcome.Abort, 'cycle aborted', []);
            case CycleState.Failed:
            case CycleState.ManualReleaseRequired:
                return ReleaseGate._decideBlocked(input);
            default:
                throw new KyklosError(KyklosErrorCode.InvalidState, `Cycle '${input.cycle.id}' is not in a decidable state: ${input.cycle.state}`);
        }
    }

    /**
     * Decide a blocked state, honouring an authorized override.
     * @param {ReleaseDecisionInput} input - The decision input.
     * @returns {ReleaseDecision} Approve on authorized override, else Reject.
     */
    protected static _decideBlocked(input: ReleaseDecisionInput): ReleaseDecision {
        const override = input.override;

        if (override !== undefined && override.decidedBy.length > 0 && override.justification.length > 0) {
            return ReleaseGate._build(input, ReleaseOutcome.Approve, `authorized override: ${override.justification}`, [override.justification], override.decidedBy);
        }

        const reason = input.cycle.state === CycleState.Failed ? 'critical check failed' : 'manual release required without authorized override';
        return ReleaseGate._build(input, ReleaseOutcome.Reject, reason, []);
    }

    /**
     * Build a release decision record.
     * @param {ReleaseDecisionInput} input - The decision input.
     * @param {ReleaseOutcome} outcome - The decided outcome.
     * @param {string} rationale - The decision rationale.
     * @param {string[]} overrides - Recorded override justifications.
     * @param {string} [decidedBy] - Overrides the default decider identity.
     * @returns {ReleaseDecision} The decision record.
     */
    protected static _build(input: ReleaseDecisionInput, outcome: ReleaseOutcome, rationale: string, overrides: string[], decidedBy?: string): ReleaseDecision {
        return {
            id: input.idGenerator.next('rd'),
            cycleId: input.cycle.id,
            outcome: outcome,
            rationale: rationale,
            ruleVersion: input.ruleVersion,
            decidedBy: decidedBy ?? input.decidedBy,
            overrides: overrides,
            decidedAt: input.clock.now(),
            evidenceIds: input.evidenceIds ?? []
        };
    }

}