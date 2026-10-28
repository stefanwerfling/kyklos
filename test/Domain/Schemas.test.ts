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
    ToolExecutionSchema
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
    makeProject,
    makeReleaseDecision,
    makeToolExecution
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
    {name: 'ToolExecution', schema: ToolExecutionSchema, value: makeToolExecution()}
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