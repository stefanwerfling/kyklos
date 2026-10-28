import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {
    type Check,
    ChecklistAmender,
    ChecklistSchema,
    FileStore,
    type ImprovementProposal,
    KyklosError,
    ProposalService,
    ProposalStatus,
    ValidationResult
} from '../../src/index';
import {makeCheck, makeChecklist} from '../fixtures';

const acceptedProposal = (): ImprovementProposal => {
    const base: ImprovementProposal = {
        id: 'prop-1',
        targetType: 'checklist',
        targetId: 'release.default',
        rationale: 'add fk consistency check',
        diff: 'add backup.restore-fk-consistency',
        status: ProposalStatus.Proposed,
        validation: {result: ValidationResult.Pending, evidenceIds: []},
        createdAt: '2026-10-28T00:00:00.000Z'
    };
    return ProposalService.accept(ProposalService.validate(base, ValidationResult.Passed));
};

const newCheck = (): Check => {
    return {...makeCheck(), id: 'backup.restore-fk-consistency'};
};

describe('ChecklistAmender', () => {
    it('refuses to amend from a non-accepted proposal', () => {
        const proposal: ImprovementProposal = {...acceptedProposal(), status: ProposalStatus.Validated};
        expect(() => ChecklistAmender.apply(makeChecklist(), proposal, {upsertCheck: newCheck()})).toThrowError(KyklosError);
    });

    it('bumps to the next minor version and keeps the original untouched', () => {
        const original = makeChecklist();
        const amended = ChecklistAmender.apply(original, acceptedProposal(), {upsertCheck: newCheck()});
        expect(amended.version).toBe('1.1.0');
        expect(original.version).toBe('1.0.0');
        expect(amended.checks.map((check) => check.id)).toContain('backup.restore-fk-consistency');
    });

    it('replaces a check by id rather than duplicating it', () => {
        const replacement: Check = {...makeCheck(), description: 'updated'};
        const amended = ChecklistAmender.apply(makeChecklist(), acceptedProposal(), {upsertCheck: replacement});
        const matching = amended.checks.filter((check) => check.id === replacement.id);
        expect(matching).toHaveLength(1);
        expect(matching[0].description).toBe('updated');
    });

    it('can remove a check', () => {
        const amended = ChecklistAmender.apply(makeChecklist(), acceptedProposal(), {removeCheckId: 'backup.restore-test'});
        expect(amended.checks.map((check) => check.id)).not.toContain('backup.restore-test');
    });
});

describe('ChecklistAmender with the store: old version is retained', () => {
    let root: string;
    let store: FileStore;

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'kyklos-amend-'));
        store = new FileStore(root);
    });

    afterEach(async () => {
        await rm(root, {recursive: true, force: true});
    });

    it('persists the new version while the old one stays readable', async () => {
        const v1 = makeChecklist();
        await store.putDefinition('checklist', ChecklistSchema, v1);

        const v2 = ChecklistAmender.apply(v1, acceptedProposal(), {upsertCheck: newCheck()});
        await store.putDefinition('checklist', ChecklistSchema, v2);

        const loadedV1 = await store.getDefinition('checklist', 'release.default', '1.0.0', ChecklistSchema);
        const loadedV2 = await store.getDefinition('checklist', 'release.default', '1.1.0', ChecklistSchema);
        expect(loadedV1.version).toBe('1.0.0');
        expect(loadedV1.checks.map((check) => check.id)).not.toContain('backup.restore-fk-consistency');
        expect(loadedV2.version).toBe('1.1.0');
        expect(loadedV2.checks.map((check) => check.id)).toContain('backup.restore-fk-consistency');
    });
});