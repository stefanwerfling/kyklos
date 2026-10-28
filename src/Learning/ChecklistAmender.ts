/**
 * ChecklistAmender — applies an accepted proposal to a checklist.
 *
 * Amending never mutates in place: it returns a new checklist with a bumped
 * version. The old version stays untouched (and, in the store, immutable), so
 * running and finished cycles that pinned it are unaffected. Only an accepted
 * proposal may amend.
 */
import {Check} from '../Domain/Check.js';
import {Checklist} from '../Domain/Checklist.js';
import {ProposalStatus} from '../Domain/Common.js';
import {ImprovementProposal} from '../Domain/ImprovementProposal.js';
import {KyklosError, KyklosErrorCode} from '../KyklosError.js';

/**
 * The concrete, machine-applicable change an acceptance carries.
 */
export interface ChecklistChange {

    /**
     * Explicit new version; defaults to the next minor version.
     * @member {string|undefined}
     */
    newVersion?: string;

    /**
     * A check to add or replace (matched by check id).
     * @member {Check|undefined}
     */
    upsertCheck?: Check;

    /**
     * A check id to remove.
     * @member {string|undefined}
     */
    removeCheckId?: string;
}

/**
 * Static amender that versions checklists forward.
 */
export class ChecklistAmender {

    /**
     * Apply an accepted proposal's change, producing a new checklist version.
     * @param {Checklist} checklist - The checklist to amend.
     * @param {ImprovementProposal} proposal - The accepted proposal driving the change.
     * @param {ChecklistChange} change - The concrete change to apply.
     * @returns {Checklist} A new checklist at a bumped version.
     */
    public static apply(checklist: Checklist, proposal: ImprovementProposal, change: ChecklistChange): Checklist {
        if (proposal.status !== ProposalStatus.Accepted) {
            throw new KyklosError(KyklosErrorCode.InvalidState, `Proposal '${proposal.id}' must be accepted before it can amend a checklist`);
        }

        let checks = checklist.checks;

        if (change.removeCheckId !== undefined) {
            const removeId = change.removeCheckId;
            checks = checks.filter((check): boolean => check.id !== removeId);
        }

        if (change.upsertCheck !== undefined) {
            const upsert = change.upsertCheck;
            checks = [...checks.filter((check): boolean => check.id !== upsert.id), upsert];
        }

        return {
            ...checklist,
            version: change.newVersion ?? ChecklistAmender._nextMinor(checklist.version),
            checks: checks
        };
    }

    /**
     * Compute the next minor version.
     * @param {string} version - A SemVer version string.
     * @returns {string} The next minor version (patch reset to 0).
     */
    protected static _nextMinor(version: string): string {
        const parts = version.split('.');
        const major = Number(parts[0] ?? '0');
        const minor = Number(parts[1] ?? '0');
        return `${major}.${minor + 1}.0`;
    }

}