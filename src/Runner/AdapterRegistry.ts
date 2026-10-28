/**
 * AdapterRegistry — maps adapter kinds to their executor instances.
 */
import {AdapterKind} from '../Domain/Common.js';
import {Adapter} from './Adapter.js';

/**
 * Registry of adapters keyed by kind.
 */
export class AdapterRegistry {

    /**
     * Registered adapters by kind.
     * @member {Map<AdapterKind, Adapter>}
     */
    protected readonly _adapters: Map<AdapterKind, Adapter> = new Map<AdapterKind, Adapter>();

    /**
     * Register an adapter under its kind.
     * @param {Adapter} adapter - The adapter to register.
     * @returns {this} This registry, for chaining.
     */
    public register(adapter: Adapter): this {
        this._adapters.set(adapter.kind, adapter);
        return this;
    }

    /**
     * Look up an adapter by kind.
     * @param {AdapterKind} kind - The adapter kind.
     * @returns {Adapter|undefined} The adapter, or undefined if none is registered.
     */
    public get(kind: AdapterKind): Adapter|undefined {
        return this._adapters.get(kind);
    }

    /**
     * Whether an adapter is registered for a kind.
     * @param {AdapterKind} kind - The adapter kind.
     * @returns {boolean} True if registered.
     */
    public has(kind: AdapterKind): boolean {
        return this._adapters.has(kind);
    }

}