import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {ChecklistSchema, CycleSchema, FileStore, KyklosError, KyklosErrorCode} from '../../src/index';
import {makeChecklist, makeCycle} from '../fixtures';

describe('FileStore', () => {
    let root: string;
    let store: FileStore;

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'kyklos-store-'));
        store = new FileStore(root);
    });

    afterEach(async () => {
        await rm(root, {recursive: true, force: true});
    });

    it('round-trips a definition through put/get', async () => {
        const checklist = makeChecklist();
        await store.putDefinition('checklist', ChecklistSchema, checklist);
        const loaded = await store.getDefinition('checklist', checklist.id, checklist.version, ChecklistSchema);
        expect(loaded).toStrictEqual(checklist);
    });

    it('refuses to overwrite a definition version (immutable)', async () => {
        const checklist = makeChecklist();
        await store.putDefinition('checklist', ChecklistSchema, checklist);
        await expect(store.putDefinition('checklist', ChecklistSchema, checklist))
            .rejects.toSatisfy((error: unknown) => error instanceof KyklosError && error.code === KyklosErrorCode.DefinitionExists);
    });

    it('allows a new version of the same definition id', async () => {
        const v1 = makeChecklist();
        const v2 = {...makeChecklist(), version: '1.1.0'};
        await store.putDefinition('checklist', ChecklistSchema, v1);
        await store.putDefinition('checklist', ChecklistSchema, v2);
        const loaded = await store.getDefinition('checklist', v2.id, '1.1.0', ChecklistSchema);
        expect(loaded.version).toBe('1.1.0');
    });

    it('round-trips an append-only record', async () => {
        const cycle = makeCycle();
        await store.appendRecord('cycle', CycleSchema, cycle);
        const loaded = await store.getRecord('cycle', cycle.id, CycleSchema);
        expect(loaded).toStrictEqual(cycle);
    });

    it('refuses to overwrite an existing record (append-only)', async () => {
        const cycle = makeCycle();
        await store.appendRecord('cycle', CycleSchema, cycle);
        await expect(store.appendRecord('cycle', CycleSchema, cycle))
            .rejects.toSatisfy((error: unknown) => error instanceof KyklosError && error.code === KyklosErrorCode.RecordExists);
    });

    it('raises NotFound for a missing definition', async () => {
        await expect(store.getDefinition('checklist', 'nope', '9.9.9', ChecklistSchema))
            .rejects.toSatisfy((error: unknown) => error instanceof KyklosError && error.code === KyklosErrorCode.NotFound);
    });

    it('rejects an invalid value before writing', async () => {
        const bad = {...makeChecklist(), version: 'nope'};
        await expect(store.putDefinition('checklist', ChecklistSchema, bad))
            .rejects.toSatisfy((error: unknown) => error instanceof KyklosError && error.code === KyklosErrorCode.ValidationFailed);
    });
});