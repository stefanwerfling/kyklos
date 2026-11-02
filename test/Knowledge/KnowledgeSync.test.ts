import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {
    FileStore,
    KnowledgeScope,
    KnowledgeSync,
    LayeredKnowledgeStore,
    type Lesson
} from '../../src/index';
import {makeLesson, makeProject} from '../fixtures';

describe('KnowledgeSync', () => {
    let projectDir: string;
    let globalDir: string;
    let store: LayeredKnowledgeStore;
    let sync: KnowledgeSync;

    beforeEach(async () => {
        projectDir = await mkdtemp(join(tmpdir(), 'kyklos-sproj-'));
        globalDir = await mkdtemp(join(tmpdir(), 'kyklos-sglob-'));
        store = new LayeredKnowledgeStore({project: new FileStore(projectDir), global: new FileStore(globalDir)});
        sync = new KnowledgeSync(store);
    });

    afterEach(async () => {
        await rm(projectDir, {recursive: true, force: true});
        await rm(globalDir, {recursive: true, force: true});
    });

    it('exports clean lessons and skips sensitive ones', async () => {
        await store.putLesson({...makeLesson(), id: 'clean', scope: KnowledgeScope.Global, statement: 'abstract lesson'});
        await store.putLesson({...makeLesson(), id: 'secret', scope: KnowledgeScope.Global, statement: 'password: hunter2'});
        const result = await sync.export(KnowledgeScope.Global);
        expect(result.exported.map((l) => l.id)).toEqual(['clean']);
        expect(result.skipped.map((s) => s.lesson.id)).toEqual(['secret']);
    });

    it('imports only lessons whose conditions are confirmed', async () => {
        const lesson: Lesson = {...makeLesson(), id: 'L'};
        const result = await sync.import([lesson], makeProject(), lesson.conditions);
        expect(result.imported.map((l) => l.id)).toEqual(['L']);
        expect(await store.getLesson(KnowledgeScope.Project, 'L', '1.0.0')).toBeDefined();
    });

    it('rejects an import whose conditions are not confirmed', async () => {
        const lesson: Lesson = {...makeLesson(), id: 'L'};
        const result = await sync.import([lesson], makeProject(), []);
        expect(result.imported).toEqual([]);
        expect(result.rejected.map((r) => r.lesson.id)).toEqual(['L']);
    });
});