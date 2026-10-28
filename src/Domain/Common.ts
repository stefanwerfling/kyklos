/**
 * Shared enums and reusable field schemas for the Kyklos domain model.
 *
 * Enum string values are the stable on-disk representation; do not rename an
 * existing value without a data migration. English is the primary language.
 */
import {StringSchema, Vts} from 'vts';

/**
 * Result status of a single check step. Explicitly separated so that a
 * skipped, not-executable or unknown critical check can never be silently
 * treated as passed.
 */
export enum CheckStatus {
    Passed = 'passed',
    Failed = 'failed',
    Skipped = 'skipped',
    NotApplicable = 'not_applicable',
    NotExecutable = 'not_executable',
    Unknown = 'unknown'
}

/**
 * Lifecycle state of a verification cycle.
 */
export enum CycleState {
    Prepared = 'prepared',
    Running = 'running',
    Passed = 'passed',
    PassedWithDeviations = 'passed_with_deviations',
    Failed = 'failed',
    Aborted = 'aborted',
    ManualReleaseRequired = 'manual_release_required'
}

/**
 * How critical a check is for the overall release gate.
 */
export enum Criticality {
    Critical = 'critical',
    Major = 'major',
    Minor = 'minor'
}

/**
 * Severity of a deviation between expected and actual state.
 */
export enum Severity {
    Low = 'low',
    Medium = 'medium',
    High = 'high',
    Critical = 'critical'
}

/**
 * Confidence level that separates observation strength (direct evidence) from
 * mere correlation or a plausible but unconfirmed hypothesis.
 */
export enum Confidence {
    Direct = 'direct',
    Correlation = 'correlation',
    Plausible = 'plausible',
    Confirmed = 'confirmed'
}

/**
 * Lifecycle status of an incident.
 */
export enum IncidentStatus {
    Open = 'open',
    Investigating = 'investigating',
    Resolved = 'resolved'
}

/**
 * Lifecycle status of an improvement proposal.
 */
export enum ProposalStatus {
    Proposed = 'proposed',
    Validated = 'validated',
    Accepted = 'accepted',
    Rejected = 'rejected'
}

/**
 * Outcome of the validation attached to an improvement proposal.
 */
export enum ValidationResult {
    Pending = 'pending',
    Passed = 'passed',
    Failed = 'failed'
}

/**
 * What a proposal targets.
 */
export enum ProposalTargetType {
    Checklist = 'checklist',
    Check = 'check'
}

/**
 * Final outcome of a release decision.
 */
export enum ReleaseOutcome {
    Approve = 'approve',
    Reject = 'reject',
    Abort = 'abort'
}

/**
 * Scope of a lesson: project-specific or generally reusable.
 */
export enum LessonScope {
    Project = 'project',
    General = 'general'
}

/**
 * Lifecycle status of a lesson.
 */
export enum LessonStatus {
    Draft = 'draft',
    Validated = 'validated',
    Published = 'published'
}

/**
 * Kind of evidence attached to an observation or decision.
 */
export enum EvidenceType {
    Log = 'log',
    Test = 'test',
    Checksum = 'checksum',
    File = 'file'
}

/**
 * Provenance tier of a piece of evidence. Keeps an LLM assertion from ever
 * being treated as a machine-verified result.
 */
export enum EvidenceSource {
    LlmAssertion = 'llm_assertion',
    ToolExecution = 'tool_execution',
    MachineVerified = 'machine_verified',
    ManuallyConfirmed = 'manually_confirmed',
    NotExecutable = 'not_executable'
}

/**
 * The authority a tool action requires. Adapters declare the tier they act at,
 * so permission boundaries are explicit and auditable.
 */
export enum PermissionTier {
    Read = 'read',
    TempTest = 'temp_test',
    LocalWrite = 'local_write',
    Shared = 'shared',
    External = 'external',
    Production = 'production'
}

/**
 * Execution adapter used by a check action.
 */
export enum AdapterKind {
    Manual = 'manual',
    Shell = 'shell',
    Http = 'http',
    Git = 'git',
    Browser = 'browser',
    Emulator = 'emulator',
    Decision = 'decision'
}

/**
 * Behaviour when a check fails.
 */
export enum OnFailure {
    Block = 'block',
    Warn = 'warn',
    Escalate = 'escalate'
}

const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

/**
 * Stable, non-empty identifier.
 */
export const IdSchema: StringSchema = Vts.string({
    description: 'Stable, non-empty identifier',
    test: (value: string): boolean => value.length > 0
});

/**
 * SemVer-style version (MAJOR.MINOR.PATCH).
 */
export const VersionSchema: StringSchema = Vts.string({
    description: 'SemVer-style version (MAJOR.MINOR.PATCH)',
    test: (value: string): boolean => SEMVER_PATTERN.test(value)
});

/**
 * Lower-case hex sha256 checksum.
 */
export const Sha256Schema: StringSchema = Vts.string({
    description: 'Lower-case hex sha256 checksum',
    test: (value: string): boolean => SHA256_PATTERN.test(value)
});

/**
 * ISO-8601 timestamp string.
 */
export const TimestampSchema: StringSchema = Vts.dateString({
    description: 'ISO-8601 timestamp'
});