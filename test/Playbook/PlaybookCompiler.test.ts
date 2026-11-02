import {describe, expect, it} from 'vitest';
import {
    type Check,
    type Checklist,
    type DefinitionSource,
    type Playbook,
    PlaybookCompiler,
    PlaybookScope,
    type PlaybookStep,
    PlaybookStatus,
    PlaybookStepKind,
    PlaybookStepRelation,
    type Procedure
} from '../../src/index';
import {makeCheck} from '../fixtures';

class MapSource implements DefinitionSource {
    public readonly pb = new Map<string, Playbook>();
    public readonly proc = new Map<string, Procedure>();
    public readonly cl = new Map<string, Checklist>();

    public async getPlaybook(id: string, v: string): Promise<Playbook | undefined> {
        return this.pb.get(`${id}@${v}`);
    }

    public async getProcedure(id: string, v: string): Promise<Procedure | undefined> {
        return this.proc.get(`${id}@${v}`);
    }

    public async getChecklist(id: string, v: string): Promise<Checklist | undefined> {
        return this.cl.get(`${id}@${v}`);
    }
}

const check = (id: string, description: string): Check => {
    return {...makeCheck(), id: id, description: description};
};

const checklist = (id: string, checks: Check[]): Checklist => {
    return {id: id, version: '1.0.0', ruleVersion: '1.0.0', checks: checks};
};

const playbook = (id: string, steps: PlaybookStep[], sealed = false): Playbook => {
    return {id: id, version: '1.0.0', name: id, status: PlaybookStatus.Published, scope: PlaybookScope.Global, targetSystems: [], technologies: [], prerequisites: [], steps: steps, sealed: sealed};
};

const procedureStep = (id: string): PlaybookStep => {
    return {kind: PlaybookStepKind.Procedure, id: id, version: '1.0.0'};
};

const checklistStep = (id: string, relation?: PlaybookStepRelation, sealed?: boolean): PlaybookStep => {
    return {kind: PlaybookStepKind.Checklist, id: id, version: '1.0.0', relation: relation, sealed: sealed};
};

const root = (id: string) => {
    return {kind: PlaybookStepKind.Playbook, id: id, version: '1.0.0'};
};

describe('PlaybookCompiler', () => {
    it('flattens procedures to checks in step order with provenance', async () => {
        const source = new MapSource();
        source.proc.set('pa@1.0.0', {id: 'pa', version: '1.0.0', name: 'pa', kind: 'x', checklistId: 'cla', checklistVersion: '1.0.0'});
        source.proc.set('pb@1.0.0', {id: 'pb', version: '1.0.0', name: 'pb', kind: 'x', checklistId: 'clb', checklistVersion: '1.0.0'});
        source.cl.set('cla@1.0.0', checklist('cla', [check('a', 'A')]));
        source.cl.set('clb@1.0.0', checklist('clb', [check('b', 'B')]));
        source.pb.set('main@1.0.0', playbook('main', [procedureStep('pa'), procedureStep('pb')]));

        const result = await PlaybookCompiler.compile(root('main'), source);
        expect(result.ok).toBe(true);
        expect(result.compiledChecks.map((c) => c.id)).toEqual(['a', 'b']);
        expect(result.checkProvenance.find((p) => p.checkId === 'a')?.sourceId).toBe('pa');
        expect(result.checkProvenance.find((p) => p.checkId === 'a')?.sourceKind).toBe(PlaybookStepKind.Procedure);
    });

    it('override replaces a check of the same id from an earlier step', async () => {
        const source = new MapSource();
        source.cl.set('base@1.0.0', checklist('base', [check('x', 'old')]));
        source.cl.set('spec@1.0.0', checklist('spec', [check('x', 'new')]));
        source.pb.set('main@1.0.0', playbook('main', [checklistStep('base'), checklistStep('spec', PlaybookStepRelation.Override)]));

        const result = await PlaybookCompiler.compile(root('main'), source);
        expect(result.compiledChecks).toHaveLength(1);
        expect(result.compiledChecks[0].description).toBe('new');
        expect(result.diagnostics.map((d) => d.kind)).toContain('override');
    });

    it('refuses to override a sealed check and keeps the sealed one', async () => {
        const source = new MapSource();
        source.cl.set('base@1.0.0', checklist('base', [check('x', 'sealed-old')]));
        source.cl.set('spec@1.0.0', checklist('spec', [check('x', 'attempt-new')]));
        source.pb.set('main@1.0.0', playbook('main', [checklistStep('base', undefined, true), checklistStep('spec', PlaybookStepRelation.Override)]));

        const result = await PlaybookCompiler.compile(root('main'), source);
        expect(result.ok).toBe(false);
        expect(result.compiledChecks[0].description).toBe('sealed-old');
        expect(result.diagnostics.map((d) => d.kind)).toContain('sealed_violation');
    });

    it('reports a duplicate check id without override as a conflict', async () => {
        const source = new MapSource();
        source.cl.set('base@1.0.0', checklist('base', [check('x', 'first')]));
        source.cl.set('dup@1.0.0', checklist('dup', [check('x', 'second')]));
        source.pb.set('main@1.0.0', playbook('main', [checklistStep('base'), checklistStep('dup')]));

        const result = await PlaybookCompiler.compile(root('main'), source);
        expect(result.ok).toBe(false);
        expect(result.compiledChecks[0].description).toBe('first');
        expect(result.diagnostics.map((d) => d.kind)).toContain('conflict');
    });

    it('reports a missing procedure', async () => {
        const source = new MapSource();
        source.pb.set('main@1.0.0', playbook('main', [procedureStep('gone')]));
        const result = await PlaybookCompiler.compile(root('main'), source);
        expect(result.ok).toBe(false);
        expect(result.diagnostics.map((d) => d.kind)).toContain('missing_prerequisite');
    });
});