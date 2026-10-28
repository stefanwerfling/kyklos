/**
 * Valid sample domain objects for the M1 tests. Free-function fixture builders
 * are allowed under the house style (tiny pure test helpers).
 */
import {
    AdapterKind,
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
    type Incident,
    IncidentStatus,
    type Lesson,
    LessonScope,
    LessonStatus,
    type Observation,
    OnFailure,
    PermissionTier,
    type Procedure,
    type Project,
    ProposalStatus,
    ProposalTargetType,
    type ReleaseDecision,
    ReleaseOutcome,
    Severity,
    type ToolExecution,
    ValidationResult
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
        stderrSha256: SHA
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
        scope: LessonScope.General,
        statement: 'Logical PostgreSQL dumps must ensure referential integrity on restore. A successful dump does not prove a successful restore.',
        appliesTo: {tech: ['postgresql'], procedureKind: ['software-release', 'backup']},
        conditions: ['Backup mechanism uses pg_dump/pg_restore', 'Schema contains foreign keys'],
        knownLimits: ['Not relevant for physical backups (pg_basebackup)'],
        provenance: {originProject: 'flyingfish', incidentSignature: 'restore-incomplete:fk-constraint'},
        validationStatus: LessonStatus.Validated,
        excludes: ['secrets', 'credentials', 'pii', 'project-internal-hostnames']
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