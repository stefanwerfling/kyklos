import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {FileStore, KnowledgeScope, LayeredKnowledgeStore} from '../../src/index';
import {makeLesson} from '../fixtures';

describe('LayeredKnowledgeStore', () => {
    let projectDir: string;
    let globalDir: string;
    let store: LayeredKnowledgeStore;

    beforeEach(async () => {
        projectDir = await mkdtemp(join(tmpdir(), 'kyklos-kproj-'));
        globalDir = await mkdtemp(join(tmpdir(), 'kyklos-kglob-'));
        store = new LayeredKnowledgeStore({project: new FileStore(projectDir), global: new FileStore(globalDir)});
    });

    afterEach(async () => {
        await rm(projectDir, {recursive: true, force: true});
        await rm(globalDir, {recursive: true, force: true});
    });

    it('writes each lesson to its own scope layer', async () => {
        await store.putLesson({...makeLesson(), id: 'L', version: '1.0.0', scope: KnowledgeScope.Global, statement: 'global'});
        expect(await store.getLesson(KnowledgeScope.Global, 'L', '1.0.0')).toBeDefined();
        expect(await store.getLesson(KnowledgeScope.Project, 'L', '1.0.0')).toBeUndefined();
    });

    it('resolves the most specific layer first', async () => {
        await store.putLesson({...makeLesson(), id: 'L', version: '1.0.0', scope: KnowledgeScope.Global, statement: 'global'});
        await store.putLesson({...makeLesson(), id: 'L', version: '1.0.0', scope: KnowledgeScope.Project, statement: 'project'});
        const resolved = await store.resolveLesson('L', '1.0.0');
        expect(resolved?.scope).toBe(KnowledgeScope.Project);
        expect(resolved?.lesson.statement).toBe('project');
    });

    it('lists lessons across all layers', async () => {
        await store.putLesson({...makeLesson(), id: 'A', version: '1.0.0', scope: KnowledgeScope.Global, statement: 'a'});
        await store.putLesson({...makeLesson(), id: 'B', version: '1.0.0', scope: KnowledgeScope.Project, statement: 'b'});
        expect(await store.all()).toHaveLength(2);
    });
});