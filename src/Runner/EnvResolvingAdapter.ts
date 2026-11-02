/**
 * EnvResolvingAdapter — substitutes ${VAR} in a check action before delegating.
 *
 * A decorator over any real adapter: it walks the action params, replaces
 * ${NAME} with the configured value, and only then runs the delegate. This is
 * how portable definitions (which carry ${VAR} placeholders) meet machine-local
 * values from a project .env without the core ever reading the environment.
 * Fail-closed: if any placeholder is left unresolved, the action is reported as
 * not executable (reason unresolved_var) rather than running a literal ${VAR}.
 */
import {CheckAction} from '../Domain/Check.js';
import {AdapterKind} from '../Domain/Common.js';
import {Adapter} from './Adapter.js';
import {AdapterOutcome} from './AdapterTypes.js';

const VAR_PATTERN = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/gu;
const ANY_VAR_PATTERN = /\$\{[^}]+\}/u;

/**
 * Decorator adapter that resolves ${VAR} placeholders from a value map.
 */
export class EnvResolvingAdapter extends Adapter {

    /**
     * The delegate's adapter kind.
     * @member {AdapterKind}
     */
    public readonly kind: AdapterKind;

    /**
     * The wrapped adapter.
     * @member {Adapter}
     */
    protected readonly _delegate: Adapter;

    /**
     * The resolution values, by variable name.
     * @member {Record<string, string>}
     */
    protected readonly _env: Record<string, string>;

    /**
     * @param {Adapter} delegate - The adapter to run after substitution.
     * @param {Record<string, string>} env - Values for ${VAR} placeholders.
     */
    public constructor(delegate: Adapter, env: Record<string, string>) {
        super();
        this.kind = delegate.kind;
        this._delegate = delegate;
        this._env = env;
    }

    /**
     * Resolve placeholders in the action, then delegate (fail-closed on a miss).
     * @param {CheckAction} action - The action to resolve and execute.
     * @returns {Promise<AdapterOutcome>} The delegate's outcome, or not-executable on an unresolved var.
     */
    public async execute(action: CheckAction): Promise<AdapterOutcome> {
        const params = EnvResolvingAdapter._resolve(action.params, this._env);
        const unresolved = EnvResolvingAdapter._firstUnresolved(params);

        if (unresolved !== undefined) {
            return {executed: false, reason: `unresolved_var: ${unresolved}`};
        }

        return this._delegate.execute({...action, params: params});
    }

    /**
     * Deep-substitute ${VAR} in every string within a value.
     * @param {unknown} value - The value (string, array, object or scalar).
     * @param {Record<string, string>} env - The value map.
     * @returns {unknown} The value with placeholders substituted where known.
     */
    protected static _resolve(value: unknown, env: Record<string, string>): unknown {
        if (typeof value === 'string') {
            return value.replace(VAR_PATTERN, (match: string, name: string): string => env[name] ?? match);
        }

        if (Array.isArray(value)) {
            return value.map((item): unknown => EnvResolvingAdapter._resolve(item, env));
        }

        if (value !== null && typeof value === 'object') {
            const result: Record<string, unknown> = {};

            for (const [key, item] of Object.entries(value)) {
                result[key] = EnvResolvingAdapter._resolve(item, env);
            }

            return result;
        }

        return value;
    }

    /**
     * Find the first still-unresolved ${...} placeholder in a value, if any.
     * @param {unknown} value - The value to scan.
     * @returns {string|undefined} The first unresolved placeholder, or undefined.
     */
    protected static _firstUnresolved(value: unknown): string|undefined {
        if (typeof value === 'string') {
            const match = ANY_VAR_PATTERN.exec(value);
            return match === null ? undefined : match[0];
        }

        if (Array.isArray(value)) {
            return EnvResolvingAdapter._firstUnresolvedIn(value);
        }

        if (value !== null && typeof value === 'object') {
            return EnvResolvingAdapter._firstUnresolvedIn(Object.values(value));
        }

        return undefined;
    }

    /**
     * First unresolved placeholder across a list of values.
     * @param {unknown[]} values - The values to scan in order.
     * @returns {string|undefined} The first unresolved placeholder, or undefined.
     */
    protected static _firstUnresolvedIn(values: unknown[]): string|undefined {
        for (const item of values) {
            const found = EnvResolvingAdapter._firstUnresolved(item);

            if (found !== undefined) {
                return found;
            }
        }

        return undefined;
    }

}