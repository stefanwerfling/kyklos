import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {
    ApprovalDecision,
    FileStore,
    KnowledgePromotion,
    KnowledgeScope,
    LayeredKnowledgeStore,
    type Lesson,
    LessonStatus
} from '../../src/index';
import {makeApproval, makeLesson} from '../fixtures';

describe('KnowledgePromotion', () => {
    let projectDir: string;
    let globalDir: string;
    let store: LayeredKnowledgeStore;
    let promotion: KnowledgePromotion;
    const lesson: Lesson = {...makeLesson(), id: 'P', version: '1.0.0', scope: KnowledgeScope.Project, validationStatus: LessonStatus.Validated};
    const approve = makeApproval();

    beforeEach(async () => {
        projectDir = await mkdtemp(join(tmpdir(), 'kyklos-pproj-'));
        globalDir = await mkdtemp(join(tmpdir(), 'kyklos-pglob-'));
        store = new LayeredKnowledgeStore({project: new FileStore(projectDir), global: new FileStore(globalDir)});
        promotion = new KnowledgePromotion(store);
    });

    afterEach(async () => {
        await rm(projectDir, {recursive: true, force: true});
        await rm(globalDir, {recursive: true, force: true});
    });

    it('promotes a validated, clean, approved lesson to a broader scope', async () => {
        const result = await promotion.promote(lesson, KnowledgeScope.Global, approve, '2.0.0');
        expect(result.promoted?.scope).toBe(KnowledgeScope.Global);
        expect(result.promoted?.version).toBe('2.0.0');
        expect(await store.getLesson(KnowledgeScope.Global, 'P', '2.0.0')).toBeDefined();
    });

    it('refuses an unvalidated lesson', async () => {
        const draft = {...lesson, validationStatus: LessonStatus.Draft};
        expect((await promotion.promote(draft, KnowledgeScope.Global, approve, '2.0.0')).reasons.join(' ')).toContain('not validated');
    });

    it('refuses a lesson with sensitive content', async () => {
        const secret = {...lesson, statement: 'contact ops@internal.example for the password'};
        expect((await promotion.promote(secret, KnowledgeScope.Global, approve, '2.0.0')).reasons.join(' ')).toContain('sensitive');
    });

    it('refuses without an approve decision', async () => {
        const reject = {...makeApproval(), decision: ApprovalDecision.Reject};
        expect((await promotion.promote(lesson, KnowledgeScope.Global, reject, '2.0.0')).reasons.join(' ')).toContain('not approved');
    });

    it('refuses a non-broader target scope', async () => {
        expect((await promotion.promote(lesson, KnowledgeScope.Project, approve, '2.0.0')).reasons.join(' ')).toContain('not broader');
    });
});