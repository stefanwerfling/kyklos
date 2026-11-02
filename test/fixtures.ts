/**
 * Valid sample domain objects for the M1 tests. Free-function fixture builders
 * are allowed under the house style (tiny pure test helpers).
 */
import {
    AdapterKind,
    type Artifact,
    ArtifactKind,
    Capability,
    type Role,
    type Environment,
    EnvironmentKind,
    type EnvironmentRun,
    type WaveRun,
    type Check,
    type Checklist,
    CheckStatus,
    Confidence,
    Criticality,
    type Cycle,
    CycleState,
    type Deviation,
    type Evidence,
    EvidenceSource,
    EvidenceType,
    type ImprovementProposal,
    type Diagnosis,
    type Incident,
    IncidentStatus,
    KnowledgeScope,
    type Lesson,
    LessonStatus,
    type Observation,
    OnFailure,
    type Diagnostic,
    DiagnosticKind,
    type ExecutionPlan,
    PermissionTier,
    type Playbook,
    PlaybookScope,
    PlaybookStatus,
    PlaybookStepKind,
    type Procedure,
    type Project,
    ProposalStatus,
    ProposalTargetType,
    type ReleaseDecision,
    ReleaseOutcome,
    Severity,
    type TargetSystem,
    type ToolExecution,
    ValidationResult,
    type Workflow,
    type WorkflowRun,
    type PhaseRun,
    WorkflowStatus,
    type Actor,
    type Approval,
    ApprovalDecision,
    type Feedback,
    FeedbackResult,
    type Task,
    type TaskAssignment,
    TaskMode
} from '../src/index';

const TS = '2026-10-28T00:00:00.000Z';
const SHA = 'a'.repeat(64);

export const makeProject = (): Project => {
    return {
        id: 'proj-flyingfish',
        name: 'FlyingFish',
        repoUrl: 'https://github.com/stefanwerfling/flyingfish',
        stack: ['node', 'postgresql'],
        tags: ['server'],
        policyRefs: []
    };
};

export const makeCheck = (): Check => {
    return {
        id: 'backup.restore-test',
        version: '1.0.0',
        group: 'backup',
        description: 'Restore into a test environment and verify consistency',
        criticality: Criticality.Critical,
        preconditions: ['backup.verify-integrity==passed'],
        action: {adapter: AdapterKind.Shell, params: {cmd: '${RESTORE_TEST_CMD}', timeoutMs: 1800000}},
        successCriterion: {kind: 'exitZero'},
        expectedEvidence: ['stdout', 'test:report'],
        onFailure: OnFailure.Block
    };
};

export const makeChecklist = (): Checklist => {
    return {
        id: 'release.default',
        version: '1.0.0',
        ruleVersion: '1.0.0',
        checks: [makeCheck()]
    };
};

export const makeProcedure = (): Procedure => {
    return {
        id: 'software-release',
        version: '1.0.0',
        name: 'Software release',
        kind: 'software-release',
        checklistId: 'release.default',
        checklistVersion: '1.0.0'
    };
};

export const makeEvidence = (): Evidence => {
    return {
        id: 'ev-1',
        type: EvidenceType.Log,
        source: EvidenceSource.ToolExecution,
        inline: 'restore ok',
        sha256: SHA,
        producedBy: 'backup.restore-test',
        createdAt: TS
    };
};

export const makeToolExecution = (): ToolExecution => {
    return {
        id: 'exec-1',
        cycleId: 'cyc-1',
        checkId: 'cli.test',
        adapter: AdapterKind.Shell,
        permissionTier: PermissionTier.TempTest,
        command: 'npm run test',
        status: CheckStatus.Passed,
        exitCode: 0,
        startedAt: TS,
        endedAt: TS,
        durationMs: 1234,
        stdout: 'ok',
        stderr: '',
        stdoutSha256: SHA,
        stderrSha256: SHA,
        outputComplete: true
    };
};

export const makeTargetSystem = (): TargetSystem => {
    return {
        id: 'debian-12',
        os: 'debian',
        osVersion: '12',
        technologies: ['nodejs', 'postgresql']
    };
};

export const makePlaybook = (): Playbook => {
    return {
        id: 'update.debian',
        version: '1.0.0',
        name: 'Update a Debian server',
        description: 'Backup, apply APT updates, verify services.',
        status: PlaybookStatus.Published,
        scope: PlaybookScope.System,
        targetSystems: ['debian'],
        technologies: [],
        prerequisites: ['maintenance window scheduled'],
        steps: [
            {kind: PlaybookStepKind.Procedure, id: 'backup.create', version: '1.0.0', relation: undefined},
            {kind: PlaybookStepKind.Checklist, id: 'apt.upgrade', version: '1.0.0'}
        ],
        successCriteria: ['all services healthy'],
        rollback: {playbookId: 'rollback.debian', version: '1.0.0'},
        evidenceRequirements: ['stdout'],
        knowledgeRefs: [{scope: PlaybookScope.System, id: 'debian-upgrade-pin'}],
        sealed: false
    };
};

export const makeActor = (): Actor => {
    return {id: 'actor-1', name: 'Alice', roles: ['operator', 'release-approver']};
};

export const makeRole = (): Role => {
    return {
        id: 'release-approver',
        version: '1.0.0',
        name: 'Release approver',
        capabilities: [Capability.ApproveRelease, Capability.AssignTask],
        maxTier: PermissionTier.Production
    };
};

export const makeTask = (): Task => {
    return {
        id: 'task-1',
        mode: TaskMode.Manual,
        description: 'Verify the hardware is installed',
        goal: 'Hardware present and powered',
        instructions: 'Check the rack and photograph it',
        successCriteria: ['hardware present'],
        evidenceRequirements: ['photo'],
        permissionTier: undefined,
        checkRef: undefined,
        assigneeRole: 'operator',
        createdAt: TS
    };
};

export const makeTaskAssignment = (): TaskAssignment => {
    return {id: 'ta-1', taskId: 'task-1', actorId: 'actor-1', assignedAt: TS, dueAt: undefined};
};

export const makeFeedback = (): Feedback => {
    return {id: 'fb-1', taskId: 'task-1', actorId: 'actor-1', result: FeedbackResult.Pass, note: 'done', evidenceIds: ['ev-1'], timeSpentMinutes: 30, submittedAt: TS};
};

export const makeApproval = (): Approval => {
    return {id: 'ap-1', taskId: 'task-1', actorId: 'actor-1', decision: ApprovalDecision.Approve, rationale: 'ok', role: 'release-approver', decidedAt: TS};
};

export const makeWorkflow = (): Workflow => {
    return {
        id: 'release.flow',
        version: '1.0.0',
        name: 'Release flow',
        description: 'Prepare then deploy.',
        status: WorkflowStatus.Published,
        phases: [
            {id: 'prepare', name: 'Prepare', dependsOn: [], optional: false, root: {kind: PlaybookStepKind.Playbook, id: 'update.debian', version: '1.0.0'}, targetSystemId: 'debian-12', rollback: undefined, runOn: undefined},
            {id: 'deploy', name: 'Deploy', dependsOn: ['prepare'], optional: false, root: {kind: PlaybookStepKind.Procedure, id: 'backup.create', version: '1.0.0'}, targetSystemId: undefined, rollback: undefined, runOn: undefined}
        ]
    };
};

export const makeWorkflowRun = (): WorkflowRun => {
    return {
        id: 'wfr-1',
        workflowId: 'release.flow',
        workflowVersion: '1.0.0',
        projectId: 'proj-example',
        startedAt: TS
    };
};

export const makePhaseRun = (): PhaseRun => {
    return {
        id: 'pr-1',
        workflowRunId: 'wfr-1',
        phaseId: 'prepare',
        state: CycleState.Passed,
        cycleId: 'cyc-1',
        planId: 'plan-1',
        startedAt: TS,
        endedAt: TS
    };
};

export const makeExecutionPlan = (): ExecutionPlan => {
    const diagnostics: Diagnostic[] = [{kind: DiagnosticKind.Addition, message: 'added backup step', ref: 'backup.create@1.0.0'}];
    return {
        id: 'plan-1',
        createdAt: TS,
        projectId: 'proj-example',
        rootKind: PlaybookStepKind.Playbook,
        rootId: 'update.debian',
        rootVersion: '1.0.0',
        targetSystemId: 'debian-12',
        resolved: [{kind: PlaybookStepKind.Playbook, id: 'update.debian', version: '1.0.0', level: PlaybookScope.System}],
        checkProvenance: [{checkId: 'backup.restore-test', sourceKind: PlaybookStepKind.Procedure, sourceId: 'backup.create', sourceVersion: '1.0.0', level: PlaybookScope.System}],
        compiledChecks: [makeCheck()],
        diagnostics: diagnostics,
        cycleId: 'cyc-1'
    };
};

export const makeObservation = (): Observation => {
    return {
        id: 'obs-1',
        checkId: 'backup.restore-test',
        checkVersion: '1.0.0',
        status: CheckStatus.Failed,
        actual: {exitCode: 1},
        measuredAt: TS,
        evidenceIds: ['ev-1']
    };
};

export const makeDeviation = (): Deviation => {
    return {
        id: 'dev-1',
        observationId: 'obs-1',
        expected: {consistent: true},
        actual: {consistent: false},
        severity: Severity.High,
        signature: 'restore-incomplete:fk-constraint',
        evidenceIds: ['ev-1']
    };
};

export const makeCycle = (): Cycle => {
    return {
        id: 'cyc-1',
        projectId: 'proj-flyingfish',
        procedureId: 'software-release',
        procedureVersion: '1.0.0',
        checklistId: 'release.default',
        checklistVersion: '1.0.0',
        state: CycleState.Failed,
        startedAt: TS,
        endedAt: TS,
        observationIds: ['obs-1'],
        deviationIds: ['dev-1']
    };
};

export const makeIncident = (): Incident => {
    return {
        id: 'inc-1',
        cycleId: 'cyc-1',
        deviationIds: ['dev-1'],
        classification: 'backup/restore',
        signature: 'restore-incomplete:fk-constraint',
        status: IncidentStatus.Open,
        confidence: Confidence.Plausible,
        rootCause: 'pg_dump --data-only without ordering guarantees',
        createdAt: TS
    };
};

export const makeImprovementProposal = (): ImprovementProposal => {
    return {
        id: 'prop-1',
        incidentId: 'inc-1',
        targetType: ProposalTargetType.Check,
        targetId: 'backup.create',
        rationale: 'Ensure referential integrity on restore',
        diff: 'use --format=custom and pg_restore --clean',
        status: ProposalStatus.Proposed,
        validation: {result: ValidationResult.Pending, evidenceIds: []},
        createdAt: TS
    };
};

export const makeLesson = (): Lesson => {
    return {
        id: 'lesson.pg-restore-fk-consistency',
        version: '1.0.0',
        scope: KnowledgeScope.Global,
        statement: 'Logical PostgreSQL dumps must ensure referential integrity on restore. A successful dump does not prove a successful restore.',
        appliesTo: {tech: ['postgresql'], procedureKind: ['software-release', 'backup']},
        conditions: ['Backup mechanism uses pg_dump/pg_restore', 'Schema contains foreign keys'],
        knownLimits: ['Not relevant for physical backups (pg_basebackup)'],
        provenance: {originProject: 'flyingfish', incidentSignature: 'restore-incomplete:fk-constraint'},
        validationStatus: LessonStatus.Validated,
        excludes: ['secrets', 'credentials', 'pii', 'project-internal-hostnames']
    };
};

export const makeDiagnosis = (): Diagnosis => {
    return {
        id: 'diag-1',
        incidentId: 'inc-1',
        hypotheses: [
            {statement: 'pg_dump --data-only without ordering guarantees', confidence: Confidence.Plausible, evidenceIds: ['ev-1']}
        ],
        chosenHypothesisIndex: 0,
        createdAt: TS
    };
};

export const makeArtifact = (): Artifact => {
    return {
        id: SHA,
        kind: ArtifactKind.DockerImage,
        name: 'ghcr.io/stefanwerfling/flyingfish',
        version: '1.0.0',
        checksums: [{algorithm: 'sha256', value: SHA}],
        producedByCycleId: 'cyc-1',
        createdAt: TS
    };
};

export const makeEnvironment = (): Environment => {
    return {
        id: 'env-prod-1',
        name: 'prod-eu-1',
        kind: EnvironmentKind.Production,
        targetSystemId: 'debian-12',
        labels: ['region:eu'],
        address: undefined
    };
};

export const makeWaveRun = (): WaveRun => {
    return {
        id: 'wave-1',
        workflowId: 'release.flow',
        workflowVersion: '1.0.0',
        projectId: 'proj-example',
        startedAt: TS
    };
};

export const makeEnvironmentRun = (): EnvironmentRun => {
    return {
        id: 'envrun-1',
        waveRunId: 'wave-1',
        waveIndex: 0,
        environmentId: 'env-prod-1',
        workflowRunId: 'wfr-1',
        state: CycleState.Passed,
        recordedAt: TS
    };
};

export const makeReleaseDecision = (): ReleaseDecision => {
    return {
        id: 'rd-1',
        cycleId: 'cyc-1',
        outcome: ReleaseOutcome.Reject,
        rationale: 'Critical restore test failed',
        ruleVersion: '1.0.0',
        decidedBy: 'release-gate',
        overrides: [],
        decidedAt: TS,
        evidenceIds: ['ev-1']
    };
};