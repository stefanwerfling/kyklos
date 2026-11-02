/**
 * PlanProposalService: an LLM candidate is recorded as a draft, validated
 * deterministically, and only published by an authorized actor — the single
 * path to a runnable definition. Fail-closed on validation and authorization.
 */
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {
    type Actor,
    AuthorizationService,
    Capability,
    type Checklist,
    ChecklistSchema,
    type PlanCandidate,
    PlanKind,
    PlanProposalService,
    type Playbook,
    PlaybookSchema,
    PlaybookScope,
    PlaybookStatus,
    PlaybookStepKind,
    type Procedure,
    ProcedureSchema,
    ProposalStatus,
    PermissionTier,
    type Role,
    RoleRegistry,
    StoreDefinitionSource,
    FileStore,
    ValidationResult
} from '../../src/index';
import {FixedClock, SequentialIdGenerator} from '../doubles';
import {makeCheck} from '../fixtures';

const cla: Checklist = {id: 'cla', version: '1.0.0', ruleVersion: '1.0.0', checks: [{...makeCheck(), id: 'ca'}]};
const pa: Procedure = {id: 'pa', version: '1.0.0', name: 'pa', kind: 'procedure', checklistId: 'cla', checklistVersion: '1.0.0'};
const draft: Playbook = {
    id: 'cand.pb', version: '0.1.0', name: 'Candidate', status: PlaybookStatus.Draft, scope: PlaybookScope.Project,
    targetSystems: [], technologies: [], prerequisites: [], steps: [{kind: PlaybookStepKind.Procedure, id: 'pa', version: '1.0.0'}], sealed: false
};
const candidate: PlanCandidate = {kind: PlanKind.Playbook, goal: 'automate', rationale: 'recurring', playbook: draft};

const publisherRole: Role = {id: 'planner', version: '1.0.0', name: 'Planner', capabilities: [Capability.PublishPlan], maxTier: PermissionTier.Production};
const publisher: Actor = {id: 'pub-1', name: 'Publisher', roles: ['planner']};
const outsider: Actor = {id: 'out-1', name: 'Outsider', roles: []};
const authorization = (): AuthorizationService => new AuthorizationService(new RoleRegistry([publisherRole]));

describe('PlanProposalService', () => {
    let dir: string;
    let store: FileStore;
    let source: StoreDefinitionSource;

    const service = (withAuth: boolean): PlanProposalService => {
        return new PlanProposalService({store: store, idGenerator: new SequentialIdGenerator(), clock: new FixedClock(), authorization: withAuth ? authorization() : undefined});
    };

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), 'kyklos-plan-'));
        store = new FileStore(dir);
        source = new StoreDefinitionSource(store);
        await store.putDefinition('checklist', ChecklistSchema, cla);
        await store.putDefinition('procedure', ProcedureSchema, pa);
    });

    afterEach(async () => {
        await rm(dir, {recursive: true, force: true});
    });

    it('records a candidate as a draft definition plus a proposed proposal', async () => {
        const proposal = await service(false).record(candidate);
        expect(proposal.status).toBe(ProposalStatus.Proposed);
        expect(proposal.origin).toBe('llm_assertion');
        const storedDraft = await store.getDefinition('playbook', 'cand.pb', '0.1.0', PlaybookSchema);
        expect(storedDraft.status).toBe(PlaybookStatus.Draft);
    });

    it('refuses to record a candidate that is not a draft', async () => {
        const published: PlanCandidate = {...candidate, playbook: {...draft, status: PlaybookStatus.Published}};
        await expect(service(false).record(published)).rejects.toThrow();
    });

    it('validates a recorded candidate to passed/validated', async () => {
        const svc = service(false);
        const proposal = await svc.record(candidate);
        const validated = await svc.validate(proposal, candidate, source);
        expect(validated.validation.result).toBe(ValidationResult.Passed);
        expect(validated.status).toBe(ProposalStatus.Validated);
    });

    it('refuses to publish an unvalidated plan', async () => {
        const svc = service(true);
        const proposal = await svc.record(candidate);
        await expect(svc.publish(proposal, candidate, publisher, '1.0.0')).rejects.toThrow();
    });

    it('refuses to publish without an authorization service (fail-closed)', async () => {
        const svc = service(false);
        const proposal = await svc.record(candidate);
        const validated = await svc.validate(proposal, candidate, source);
        await expect(svc.publish(validated, candidate, publisher, '1.0.0')).rejects.toThrow();
    });

    it('refuses to publish for an actor lacking PublishPlan', async () => {
        const svc = service(true);
        const proposal = await svc.record(candidate);
        const validated = await svc.validate(proposal, candidate, source);
        await expect(svc.publish(validated, candidate, outsider, '1.0.0')).rejects.toThrow();
    });

    it('publishes a validated plan for an authorized actor', async () => {
        const svc = service(true);
        const proposal = await svc.record(candidate);
        const validated = await svc.validate(proposal, candidate, source);
        const publication = await svc.publish(validated, candidate, publisher, '1.0.0');

        expect(publication.proposal.status).toBe(ProposalStatus.Accepted);
        const published = await store.getDefinition('playbook', 'cand.pb', '1.0.0', PlaybookSchema);
        expect(published.status).toBe(PlaybookStatus.Published);
    });
});
