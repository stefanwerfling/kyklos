/**
 * Deterministic test doubles for the injected cycle collaborators.
 */
import type {Clock, IdGenerator} from '../src/index';

export class FixedClock implements Clock {
    public now(): string {
        return '2026-10-28T00:00:00.000Z';
    }
}

export class SequentialIdGenerator implements IdGenerator {
    private _counter = 0;

    public next(prefix?: string): string {
        this._counter += 1;
        return `${prefix ?? 'id'}-${this._counter}`;
    }
}