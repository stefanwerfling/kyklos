import {describe, expect, it} from 'vitest';
import {ChecklistSchema, Codec, KyklosError, KyklosErrorCode, ProjectSchema} from '../../src/index';
import {makeChecklist, makeProject} from '../fixtures';

describe('Codec round-trip', () => {
    it('encodes and decodes a Project back to an identical value', () => {
        const project = makeProject();
        const decoded = Codec.decode(ProjectSchema, Codec.encode(ProjectSchema, project));
        expect(decoded).toStrictEqual(project);
    });

    it('encodes and decodes a nested Checklist back to an identical value', () => {
        const checklist = makeChecklist();
        const decoded = Codec.decode(ChecklistSchema, Codec.encode(ChecklistSchema, checklist));
        expect(decoded).toStrictEqual(checklist);
    });
});

describe('Codec validation', () => {
    it('rejects a value with a wrong-typed field', () => {
        const bad = {...makeProject(), name: 123};
        expect(() => Codec.encode(ProjectSchema, bad as never)).toThrowError(KyklosError);
    });

    it('rejects an unknown extra key (strict object schema)', () => {
        const text = JSON.stringify({...makeProject(), surprise: true});
        expect(() => Codec.decode(ProjectSchema, text)).toThrowError(KyklosError);
    });

    it('attaches the validation_failed code and schema details', () => {
        try {
            Codec.decode(ProjectSchema, JSON.stringify({id: 'x'}));
            expect.unreachable('should have thrown');
        } catch (error) {
            expect(error).toBeInstanceOf(KyklosError);
            expect((error as KyklosError).code).toBe(KyklosErrorCode.ValidationFailed);
            expect((error as KyklosError).details).toBeDefined();
        }
    });

    it('rejects an empty id (non-empty id constraint)', () => {
        const bad = {...makeProject(), id: ''};
        expect(() => Codec.encode(ProjectSchema, bad)).toThrowError(KyklosError);
    });
});