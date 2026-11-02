import {describe, expect, it} from 'vitest';
import {
    CheckSchema,
    ChecklistSchema,
    CycleSchema,
    DeviationSchema,
    EvidenceSchema,
    ImprovementProposalSchema,
    IncidentSchema,
    LessonSchema,
    ObservationSchema,
    ProcedureSchema,
    ProjectSchema,
    ReleaseDecisionSchema,
    ExecutionPlanSchema,
    PhaseRunSchema,
    PlaybookSchema,
    TargetSystemSchema,
    ToolExecutionSchema,
    WorkflowRunSchema,
    WorkflowSchema,
    ActorSchema,
    ApprovalSchema,
    ArtifactSchema,
    DiagnosisSchema,
    EnvironmentSchema,
    EnvironmentRunSchema,
    FeedbackSchema,
    PlanProposalSchema,
    RoleSchema,
    TaskAssignmentSchema,
    TaskSchema,
    WaveRunSchema
} from '../../src/index';
import {
    makeCheck,
    makeChecklist,
    makeCycle,
    makeDeviation,
    makeEvidence,
    makeImprovementProposal,
    makeIncident,
    makeLesson,
    makeObservation,
    makeProcedure,
    makeExecutionPlan,
    makePlaybook,
    makePhaseRun,
    makeProject,
    makeReleaseDecision,
    makeTargetSystem,
    makeToolExecution,
    makeWorkflow,
    makeWorkflowRun,
    makeActor,
    makeApproval,
    makeArtifact,
    makeDiagnosis,
    makeEnvironment,
    makeEnvironmentRun,
    makeFeedback,
    makePlanProposal,
    makeRole,
    makeTask,
    makeTaskAssignment,
    makeWaveRun
} from '../fixtures';

const cases = [
    {name: 'Project', schema: ProjectSchema, value: makeProject()},
    {name: 'Procedure', schema: ProcedureSchema, value: makeProcedure()},
    {name: 'Check', schema: CheckSchema, value: makeCheck()},
    {name: 'Checklist', schema: ChecklistSchema, value: makeChecklist()},
    {name: 'Evidence', schema: EvidenceSchema, value: makeEvidence()},
    {name: 'Observation', schema: ObservationSchema, value: makeObservation()},
    {name: 'Deviation', schema: DeviationSchema, value: makeDeviation()},
    {name: 'Cycle', schema: CycleSchema, value: makeCycle()},
    {name: 'Incident', schema: IncidentSchema, value: makeIncident()},
    {name: 'ImprovementProposal', schema: ImprovementProposalSchema, value: makeImprovementProposal()},
    {name: 'ReleaseDecision', schema: ReleaseDecisionSchema, value: makeReleaseDecision()},
    {name: 'Lesson', schema: LessonSchema, value: makeLesson()},
    {name: 'ToolExecution', schema: ToolExecutionSchema, value: makeToolExecution()},
    {name: 'TargetSystem', schema: TargetSystemSchema, value: makeTargetSystem()},
    {name: 'Playbook', schema: PlaybookSchema, value: makePlaybook()},
    {name: 'ExecutionPlan', schema: ExecutionPlanSchema, value: makeExecutionPlan()},
    {name: 'Workflow', schema: WorkflowSchema, value: makeWorkflow()},
    {name: 'WorkflowRun', schema: WorkflowRunSchema, value: makeWorkflowRun()},
    {name: 'PhaseRun', schema: PhaseRunSchema, value: makePhaseRun()},
    {name: 'Actor', schema: ActorSchema, value: makeActor()},
    {name: 'Task', schema: TaskSchema, value: makeTask()},
    {name: 'TaskAssignment', schema: TaskAssignmentSchema, value: makeTaskAssignment()},
    {name: 'Feedback', schema: FeedbackSchema, value: makeFeedback()},
    {name: 'Approval', schema: ApprovalSchema, value: makeApproval()},
    {name: 'Diagnosis', schema: DiagnosisSchema, value: makeDiagnosis()},
    {name: 'Artifact', schema: ArtifactSchema, value: makeArtifact()},
    {name: 'Environment', schema: EnvironmentSchema, value: makeEnvironment()},
    {name: 'WaveRun', schema: WaveRunSchema, value: makeWaveRun()},
    {name: 'EnvironmentRun', schema: EnvironmentRunSchema, value: makeEnvironmentRun()},
    {name: 'Role', schema: RoleSchema, value: makeRole()},
    {name: 'PlanProposal', schema: PlanProposalSchema, value: makePlanProposal()}
];

describe('Domain schemas accept valid samples', () => {
    for (const testCase of cases) {
        it(`validates a valid ${testCase.name}`, () => {
            expect(testCase.schema.validate(testCase.value, [])).toBe(true);
        });
    }
});

describe('Domain schemas reject bad input', () => {
    it('rejects an invalid enum value', () => {
        const bad = {...makeObservation(), status: 'green'};
        expect(ObservationSchema.validate(bad, [])).toBe(false);
    });

    it('rejects a bad sha256 checksum', () => {
        const bad = {...makeEvidence(), sha256: 'not-a-hash'};
        expect(EvidenceSchema.validate(bad, [])).toBe(false);
    });

    it('rejects a non-semver version', () => {
        const bad = {...makeCheck(), version: 'v1'};
        expect(CheckSchema.validate(bad, [])).toBe(false);
    });

    it('rejects a missing required field', () => {
        const bad = {...makeReleaseDecision()} as Record<string, unknown>;
        delete bad.outcome;
        expect(ReleaseDecisionSchema.validate(bad, [])).toBe(false);
    });
});