import {describe, expect, it} from 'vitest';
import {
    type ImprovementProposal,
    KyklosError,
    KyklosErrorCode,
    ProposalBuilder,
    ProposalService,
    ProposalStatus,
    ProposalTargetType,
    ValidationResult
} from '../../src/index';
import {makeIncident} from '../fixtures';

const build = (): ImprovementProposal => {
    return ProposalBuilder.fromIncident(
        makeIncident(),
        {targetType: ProposalTargetType.Check, targetId: 'backup.create', rationale: 'ensure fk consistency', diff: 'use pg_restore --clean'},
        'prop-1',
        '2026-10-28T00:00:00.000Z'
    );
};

describe('ProposalBuilder', () => {
    it('builds a proposed, pending-validation proposal', () => {
        const proposal = build();
        expect(proposal.status).toBe(ProposalStatus.Proposed);
        expect(proposal.validation.result).toBe(ValidationResult.Pending);
    });
});

describe('ProposalService validation gate', () => {
    it('refuses to accept a proposal without a passed validation', () => {
        try {
            ProposalService.accept(build());
            expect.unreachable('should have thrown');
        } catch (error) {
            expect(error).toBeInstanceOf(KyklosError);
            expect((error as KyklosError).code).toBe(KyklosErrorCode.InvalidState);
        }
    });

    it('refuses to accept after a failed validation', () => {
        const failed = ProposalService.validate(build(), ValidationResult.Failed);
        expect(() => ProposalService.accept(failed)).toThrowError(KyklosError);
    });

    it('accepts only after a passed validation', () => {
        const validated = ProposalService.validate(build(), ValidationResult.Passed, ['ev-1'], 'test environment run');
        expect(validated.status).toBe(ProposalStatus.Validated);
        expect(validated.validation.result).toBe(ValidationResult.Passed);

        const accepted = ProposalService.accept(validated);
        expect(accepted.status).toBe(ProposalStatus.Accepted);
    });

    it('can reject a proposal', () => {
        expect(ProposalService.reject(build()).status).toBe(ProposalStatus.Rejected);
    });
});