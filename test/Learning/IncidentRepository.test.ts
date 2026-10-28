import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {FileStore, IncidentBuilder, IncidentRepository} from '../../src/index';
import {makeDeviation, makeIncident} from '../fixtures';

describe('IncidentRepository', () => {
    let root: string;
    let repo: IncidentRepository;

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'kyklos-incident-'));
        repo = new IncidentRepository(new FileStore(root));
    });

    afterEach(async () => {
        await rm(root, {recursive: true, force: true});
    });

    it('returns an empty list before anything is stored', async () => {
        expect(await repo.all()).toEqual([]);
        expect(await repo.findSimilar({signature: 'x'})).toEqual([]);
    });

    it('stores an incident and finds it again by signature', async () => {
        const incident = {...makeIncident(), id: 'inc-1', signature: 'backup:restore:failed'};
        await repo.save(incident);
        const found = await repo.findSimilar({signature: 'backup:restore:failed'});
        expect(found).toHaveLength(1);
        expect(found[0]).toStrictEqual(incident);
    });

    it('does not link an unrelated prior incident', async () => {
        await repo.save({...makeIncident(), id: 'inc-1', signature: 'backup:restore:failed'});
        await repo.save({...makeIncident(), id: 'inc-2', signature: 'deploy:health:failed'});
        const found = await repo.findSimilar({signature: 'deploy:health:failed'});
        expect(found.map((inc) => inc.id)).toEqual(['inc-2']);
    });

    it('builds an incident from a deviation and finds it by that deviation signature', async () => {
        const deviation = {...makeDeviation(), signature: 'backup:restore:failed'};
        const incident = IncidentBuilder.fromDeviation(deviation, {classification: 'backup', cycleId: 'cyc-1'}, 'inc-1', '2026-10-28T00:00:00.000Z');
        await repo.save(incident);
        const found = await repo.findSimilar({signature: deviation.signature, classification: 'backup'});
        expect(found).toHaveLength(1);
        expect(found[0].deviationIds).toEqual([deviation.id]);
    });
});