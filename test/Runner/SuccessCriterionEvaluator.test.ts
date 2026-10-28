import {describe, expect, it} from 'vitest';
import {type AdapterOutcome, CheckStatus, SuccessCriterionEvaluator} from '../../src/index';

const run = (kind: string, params: unknown, outcome: AdapterOutcome): CheckStatus => {
    return SuccessCriterionEvaluator.evaluate({kind: kind, params: params}, outcome).status;
};

describe('SuccessCriterionEvaluator', () => {
    it('exitZero: passed on code 0, failed otherwise', () => {
        expect(run('exitZero', undefined, {executed: true, exitCode: 0})).toBe(CheckStatus.Passed);
        expect(run('exitZero', undefined, {executed: true, exitCode: 1})).toBe(CheckStatus.Failed);
    });

    it('regex: matches stdout', () => {
        expect(run('regex', {pattern: '^ok$'}, {executed: true, stdout: 'ok'})).toBe(CheckStatus.Passed);
        expect(run('regex', {pattern: '^ok$'}, {executed: true, stdout: 'no'})).toBe(CheckStatus.Failed);
    });

    it('regex: unknown on invalid params or invalid regex', () => {
        expect(run('regex', {nope: true}, {executed: true, stdout: 'ok'})).toBe(CheckStatus.Unknown);
        expect(run('regex', {pattern: '('}, {executed: true, stdout: 'ok'})).toBe(CheckStatus.Unknown);
    });

    it('empty / nonEmpty', () => {
        expect(run('empty', undefined, {executed: true, stdout: ''})).toBe(CheckStatus.Passed);
        expect(run('empty', undefined, {executed: true, stdout: 'x'})).toBe(CheckStatus.Failed);
        expect(run('nonEmpty', undefined, {executed: true, stdout: 'x'})).toBe(CheckStatus.Passed);
    });

    it('httpStatus: equals comparison, unknown when missing', () => {
        expect(run('httpStatus', {equals: 200}, {executed: true, httpStatus: 200})).toBe(CheckStatus.Passed);
        expect(run('httpStatus', {equals: 200}, {executed: true, httpStatus: 500})).toBe(CheckStatus.Failed);
        expect(run('httpStatus', {equals: 200}, {executed: true})).toBe(CheckStatus.Unknown);
    });

    it('manualConfirm: unknown when unanswered', () => {
        expect(run('manualConfirm', undefined, {executed: true, confirmed: true})).toBe(CheckStatus.Passed);
        expect(run('manualConfirm', undefined, {executed: true, confirmed: false})).toBe(CheckStatus.Failed);
        expect(run('manualConfirm', undefined, {executed: true})).toBe(CheckStatus.Unknown);
    });

    it('unknown criterion kind -> unknown', () => {
        expect(run('teleport', undefined, {executed: true})).toBe(CheckStatus.Unknown);
    });
});