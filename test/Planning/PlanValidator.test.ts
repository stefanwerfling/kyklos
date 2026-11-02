import {describe, expect, it} from 'vitest';
import {
    type Checklist,
    type DefinitionSource,
    DiagnosticKind,
    type PlanCandidate,
    PlanKind,
    PlanValidator,
    type Playbook,
    PlaybookScope,
    PlaybookStatus,
    PlaybookStepKind,
    type Procedure,
    ValidationResult,
    type Workflow,
    WorkflowStatus
} from '../../src/index';
import {makeCheck} from '../fixtures';

const cla: Checklist = {id: 'cla', version: '1.0.0', ruleVersion: '1.0.0', checks: [{...makeCheck(), id: 'ca'}]};
const pa: Procedure = {id: 'pa', version: '1.0.0', name: 'pa', kind: 'procedure', checklistId: 'cla', checklistVersion: '1.0.0'};
const draftPlaybook: Playbook = {
    id: 'cand.pb', version: '0.1.0', name: 'Candidate playbook', status: PlaybookStatus.Draft, scope: PlaybookScope.Project,
    targetSystems: [], technologies: [], prerequisites: [], steps: [{kind: PlaybookStepKind.Procedure, id: 'pa', version: '1.0.0'}], sealed: false
};

/**
 * An in-memory DefinitionSource over fixed definitions, keyed id@version.
 */
class InMemorySource implements DefinitionSource {
    private readonly _playbooks = new Map<string, Playbook>();
    private readonly _procedures = new Map<string, Procedure>();
    private readonly _checklists = new Map<string, Checklist>();

    public constructor(playbooks: Playbook[], procedures: Procedure[], checklists: Checklist[]) {
        for (const playbook of playbooks) {
            this._playbooks.set(`${playbook.id}@${playbook.version}`, playbook);
        }
        for (const procedure of procedures) {
            this._procedures.set(`${procedure.id}@${procedure.version}`, procedure);
        }
        for (const checklist of checklists) {
            this._checklists.set(`${checklist.id}@${checklist.version}`, checklist);
        }
    }

    public async getPlaybook(id: string, version: string): Promise<Playbook|undefined> {
        return this._playbooks.get(`${id}@${version}`);
    }

    public async getProcedure(id: string, version: string): Promise<Procedure|undefined> {
        return this._procedures.get(`${id}@${version}`);
    }

    public async getChecklist(id: string, version: string): Promise<Checklist|undefined> {
        return this._checklists.get(`${id}@${version}`);
    }
}

const playbookCandidate = (playbook: Playbook): PlanCandidate => {
    return {kind: PlanKind.Playbook, goal: 'goal', rationale: 'why', playbook: playbook};
};

const sourceWith = (playbook: Playbook): DefinitionSource => {
    return new InMemorySource([playbook], [pa], [cla]);
};

describe('PlanValidator', () => {
    it('passes a clean, draft, compilable playbook candidate', async () => {
        const result = await PlanValidator.validate(playbookCandidate(draftPlaybook), sourceWith(draftPlaybook));
        expect(result.result).toBe(ValidationResult.Passed);
        expect(result.diagnostics).toEqual([]);
    });

    it('fails a candidate that is not a draft', async () => {
        const published = {...draftPlaybook, status: PlaybookStatus.Published};
        const result = await PlanValidator.validate(playbookCandidate(published), sourceWith(published));
        expect(result.result).toBe(ValidationResult.Failed);
        expect(result.diagnostics.some((diagnostic) => diagnostic.message.includes('draft'))).toBe(true);
    });

    it('fails a candidate that contains a secret', async () => {
        const secret = {...draftPlaybook, description: 'login with password: hunter2'};
        const result = await PlanValidator.validate(playbookCandidate(secret), sourceWith(secret));
        expect(result.result).toBe(ValidationResult.Failed);
        expect(result.diagnostics.some((diagnostic) => diagnostic.kind === DiagnosticKind.Conflict)).toBe(true);
    });

    it('fails a candidate whose step references a missing definition', async () => {
        // The source does not contain procedure 'pa', so compilation cannot resolve it.
        const source = new InMemorySource([draftPlaybook], [], [cla]);
        const result = await PlanValidator.validate(playbookCandidate(draftPlaybook), source);
        expect(result.result).toBe(ValidationResult.Failed);
        expect(result.diagnostics.some((diagnostic) => diagnostic.kind === DiagnosticKind.MissingPrerequisite)).toBe(true);
    });

    it('fails a workflow candidate with a phase dependency cycle', async () => {
        const workflow: Workflow = {
            id: 'cand.wf', version: '0.1.0', name: 'Candidate workflow', status: WorkflowStatus.Draft,
            phases: [
                {id: 'a', name: 'A', dependsOn: ['b'], optional: false, root: {kind: PlaybookStepKind.Procedure, id: 'pa', version: '1.0.0'}, targetSystemId: undefined, rollback: undefined, runOn: undefined},
                {id: 'b', name: 'B', dependsOn: ['a'], optional: false, root: {kind: PlaybookStepKind.Procedure, id: 'pa', version: '1.0.0'}, targetSystemId: undefined, rollback: undefined, runOn: undefined}
            ]
        };
        const result = await PlanValidator.validate({kind: PlanKind.Workflow, goal: 'g', rationale: 'r', workflow: workflow}, new InMemorySource([], [pa], [cla]));
        expect(result.result).toBe(ValidationResult.Failed);
        expect(result.diagnostics.some((diagnostic) => diagnostic.kind === DiagnosticKind.CycleDetected)).toBe(true);
    });

    it('passes a clean workflow candidate whose roots resolve', async () => {
        const workflow: Workflow = {
            id: 'cand.wf', version: '0.1.0', name: 'Candidate workflow', status: WorkflowStatus.Draft,
            phases: [
                {id: 'a', name: 'A', dependsOn: [], optional: false, root: {kind: PlaybookStepKind.Procedure, id: 'pa', version: '1.0.0'}, targetSystemId: undefined, rollback: undefined, runOn: undefined}
            ]
        };
        const result = await PlanValidator.validate({kind: PlanKind.Workflow, goal: 'g', rationale: 'r', workflow: workflow}, new InMemorySource([], [pa], [cla]));
        expect(result.result).toBe(ValidationResult.Passed);
    });
});
