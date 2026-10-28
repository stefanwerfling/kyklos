import {describe, expect, it} from 'vitest';
import {type Lesson, LessonSanitizer, LessonStatus, LessonTransfer, type Project} from '../../src/index';
import {makeLesson, makeProject} from '../fixtures';

const pgProject = (): Project => {
    return {...makeProject(), id: 'proj-helionet', stack: ['node', 'postgresql']};
};

const allConditions = (lesson: Lesson): string[] => {
    return [...lesson.conditions];
};

describe('LessonTransfer', () => {
    it('transfers when validated, tech matches and all conditions are confirmed', () => {
        const lesson = makeLesson();
        const decision = LessonTransfer.evaluate(lesson, pgProject(), allConditions(lesson));
        expect(decision.transferable).toBe(true);
        expect(decision.reasons).toEqual([]);
    });

    it('refuses when the target stack lacks a required technology', () => {
        const lesson = makeLesson();
        const project: Project = {...makeProject(), stack: ['node']};
        const decision = LessonTransfer.evaluate(lesson, project, allConditions(lesson));
        expect(decision.transferable).toBe(false);
        expect(decision.reasons.join(' ')).toContain('missing tech');
    });

    it('refuses when a condition is not confirmed', () => {
        const lesson = makeLesson();
        const decision = LessonTransfer.evaluate(lesson, pgProject(), ['Schema contains foreign keys']);
        expect(decision.transferable).toBe(false);
        expect(decision.reasons.join(' ')).toContain('unmet conditions');
    });

    it('refuses a draft lesson', () => {
        const lesson: Lesson = {...makeLesson(), validationStatus: LessonStatus.Draft};
        const decision = LessonTransfer.evaluate(lesson, pgProject(), allConditions(lesson));
        expect(decision.transferable).toBe(false);
        expect(decision.reasons.join(' ')).toContain('not validated');
    });

    it('never transfers a lesson that contains secrets or PII', () => {
        const withEmail: Lesson = {...makeLesson(), statement: 'Contact ops@internal.example for the dump password'};
        const decision = LessonTransfer.evaluate(withEmail, pgProject(), allConditions(withEmail));
        expect(decision.transferable).toBe(false);
        expect(decision.reasons.join(' ')).toContain('sensitive content');
    });

    it('never transfers a lesson that embeds an internal host', () => {
        const withHost: Lesson = {...makeLesson(), conditions: [...makeLesson().conditions, 'db host is 10.0.0.5']};
        const decision = LessonTransfer.evaluate(withHost, pgProject(), allConditions(withHost));
        expect(decision.transferable).toBe(false);
    });
});

describe('LessonSanitizer', () => {
    it('is clean for an abstract lesson', () => {
        expect(LessonSanitizer.inspect(makeLesson())).toEqual([]);
    });

    it('flags emails, secrets and ipv4 hosts', () => {
        expect(LessonSanitizer.findSensitive(['mail me at a@b.co'])).toContain('email');
        expect(LessonSanitizer.findSensitive(['password: hunter2'])).toContain('secret');
        expect(LessonSanitizer.findSensitive(['host 192.168.1.10'])).toContain('ipv4');
    });
});