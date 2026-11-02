import {describe, expect, it} from 'vitest';
import {
    type Playbook,
    type PlaybookRepository,
    PlaybookResolver,
    PlaybookScope,
    PlaybookStatus,
    PlaybookStepKind
} from '../../src/index';
import {makeTargetSystem} from '../fixtures';

const pb = (over: Partial<Playbook> & {id: string;}): Playbook => {
    return {
        id: over.id,
        version: '1.0.0',
        name: over.id,
        status: PlaybookStatus.Published,
        scope: PlaybookScope.System,
        targetSystems: ['debian'],
        technologies: [],
        prerequisites: [],
        steps: [],
        sealed: false,
        ...over
    };
};

const repo = (playbooks: Playbook[]): PlaybookRepository => {
    const map = new Map(playbooks.map((p) => [`${p.id}@${p.version}`, p]));
    return {getPlaybook: async (id: string, version: string): Promise<Playbook | undefined> => map.get(`${id}@${version}`)};
};

const root = (id: string) => {
    return {kind: PlaybookStepKind.Playbook, id: id, version: '1.0.0'};
};

const request = (id: string) => {
    return {projectId: 'proj', target: makeTargetSystem(), root: root(id)};
};

describe('PlaybookResolver', () => {
    it('resolves a composed playbook with provenance levels', async () => {
        const sub = pb({id: 'sub', scope: PlaybookScope.Technology, targetSystems: [], steps: [{kind: PlaybookStepKind.Procedure, id: 'p2', version: '1.0.0'}]});
        const main = pb({id: 'main', steps: [
            {kind: PlaybookStepKind.Playbook, id: 'sub', version: '1.0.0'},
            {kind: PlaybookStepKind.Procedure, id: 'p1', version: '1.0.0'},
            {kind: PlaybookStepKind.Checklist, id: 'c1', version: '1.0.0'}
        ]});
        const result = await PlaybookResolver.resolve(request('main'), repo([main, sub]));
        expect(result.ok).toBe(true);
        const ids = result.resolved.map((entry) => entry.id);
        expect(ids).toEqual(expect.arrayContaining(['main', 'sub', 'p1', 'c1', 'p2']));
        expect(result.resolved.find((e) => e.id === 'sub')?.level).toBe(PlaybookScope.Technology);
    });

    it('reports a missing pinned version', async () => {
        const main = pb({id: 'main', steps: [{kind: PlaybookStepKind.Playbook, id: 'gone', version: '9.9.9'}]});
        const result = await PlaybookResolver.resolve(request('main'), repo([main]));
        expect(result.ok).toBe(false);
        expect(result.diagnostics.map((d) => d.kind)).toContain('missing_prerequisite');
    });

    it('reports an incompatible target system', async () => {
        const main = pb({id: 'main', targetSystems: ['windows']});
        const result = await PlaybookResolver.resolve(request('main'), repo([main]));
        expect(result.ok).toBe(false);
        expect(result.diagnostics.map((d) => d.kind)).toContain('incompatible');
    });

    it('reports a missing technology', async () => {
        const main = pb({id: 'main', technologies: ['rust']});
        const result = await PlaybookResolver.resolve(request('main'), repo([main]));
        expect(result.ok).toBe(false);
        expect(result.diagnostics.map((d) => d.kind)).toContain('incompatible');
    });

    it('detects a reference cycle', async () => {
        const a = pb({id: 'a', steps: [{kind: PlaybookStepKind.Playbook, id: 'b', version: '1.0.0'}]});
        const b = pb({id: 'b', steps: [{kind: PlaybookStepKind.Playbook, id: 'a', version: '1.0.0'}]});
        const result = await PlaybookResolver.resolve(request('a'), repo([a, b]));
        expect(result.ok).toBe(false);
        expect(result.diagnostics.map((d) => d.kind)).toContain('cycle_detected');
    });

    it('resolves a bare procedure root as a project-level leaf', async () => {
        const result = await PlaybookResolver.resolve({projectId: 'proj', target: makeTargetSystem(), root: {kind: PlaybookStepKind.Procedure, id: 'p', version: '1.0.0'}}, repo([]));
        expect(result.ok).toBe(true);
        expect(result.resolved).toEqual([{kind: PlaybookStepKind.Procedure, id: 'p', version: '1.0.0', level: PlaybookScope.Project}]);
    });

    it('is deterministic', async () => {
        const main = pb({id: 'main', steps: [{kind: PlaybookStepKind.Procedure, id: 'p1', version: '1.0.0'}]});
        const a = await PlaybookResolver.resolve(request('main'), repo([main]));
        const b = await PlaybookResolver.resolve(request('main'), repo([main]));
        expect(a).toEqual(b);
    });
});